from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import re
import threading
from datetime import datetime, timezone

_scrape_running = False
_scrape_lock = threading.Lock()
_last_results = None
_last_run_at = None
_last_error = None
_stop_requested = False
_stopped = False
_current_driver = None
_progress_lock = threading.Lock()
_progress = {"index": 0, "total": 0, "url": None, "regulation_name": None, "phase": "Idle", "detail": ""}

# EUR-Lex ELI URLs for EU banking/finance regulations relevant to regulatory reporting
# (COREP/FINREP, capital requirements, recovery & resolution, supervision).
REGULATION_URLS = [
    "https://eur-lex.europa.eu/eli/reg/2013/575/oj/eng",       # CRR - Capital Requirements Regulation
    "https://eur-lex.europa.eu/eli/reg_impl/2021/451/oj/eng",  # CRR ITS - COREP/FINREP reporting
    "https://eur-lex.europa.eu/eli/dir/2013/36/oj/eng",        # CRD IV - Capital Requirements Directive
    "https://eur-lex.europa.eu/eli/dir/2014/59/oj/eng",        # BRRD - Bank Recovery and Resolution Directive
    "https://eur-lex.europa.eu/eli/reg/2013/1024/oj/eng",      # SSM Regulation - Single Supervisory Mechanism
]


def _set_progress(index=None, total=None, url=None, regulation_name=None, phase=None, detail=""):
    global _progress
    with _progress_lock:
        _progress = {
            "index": index if index is not None else _progress.get("index", 0),
            "total": total if total is not None else _progress.get("total", 0),
            "url": url if url is not None else _progress.get("url"),
            "regulation_name": regulation_name if regulation_name is not None else _progress.get("regulation_name"),
            "phase": phase if phase is not None else _progress.get("phase", "Idle"),
            "detail": detail,
        }


def get_status():
    """Return the current scrape status without blocking on the lock."""
    with _progress_lock:
        progress = dict(_progress)
    return {
        "running": _scrape_running,
        "results": _last_results,
        "last_run_at": _last_run_at,
        "error": _last_error,
        "stopped": _stopped,
        "progress": progress,
    }


def is_scraping() -> bool:
    return _scrape_running


def request_stop():
    """Best-effort stop: flags the loop to halt and force-quits the active browser
    so any in-progress blocking Selenium call fails and unblocks the scraping thread."""
    global _stop_requested
    _stop_requested = True
    driver = _current_driver
    if driver is not None:
        try:
            driver.quit()
        except Exception:
            pass
    return {"stopping": True}


def clear_results():
    global _last_results, _last_run_at, _last_error, _stopped, _stop_requested
    with _scrape_lock:
        if _scrape_running:
            raise RuntimeError("Stop the active scrape before clearing results")
        _last_results = None
        _last_run_at = None
        _last_error = None
        _stopped = False
        _stop_requested = False
    _set_progress(index=0, total=0, url=None, regulation_name=None, phase="Idle", detail="")
    return {"cleared": True}


def extract_regulation_name(url):
    """
    Extract regulation name from EUR-Lex URL.

    Examples:
        /eli/reg/2013/575/oj/eng -> "Regulation 575/2013"
        /eli/reg_impl/2021/451/oj/eng -> "Implementing Regulation 451/2021"
        /eli/dir/2014/65/oj/eng -> "Directive 65/2014"

    Args:
        url (str): EUR-Lex URL

    Returns:
        str: Human-readable regulation name
    """
    match = re.search(r'/eli/(reg_impl|reg_del|reg|dir_impl|dir_del|dir)/(\d+)/(\d+)', url)

    if match:
        doc_type = match.group(1)
        year = match.group(2)
        number = match.group(3)

        type_names = {
            'reg': 'Regulation',
            'reg_impl': 'Implementing Regulation',
            'reg_del': 'Delegated Regulation',
            'dir': 'Directive',
            'dir_impl': 'Implementing Directive',
            'dir_del': 'Delegated Directive',
        }

        type_display = type_names.get(doc_type, doc_type.replace('_', ' ').upper())

        return f"{type_display} {number}/{year}"

    return url.split('/')[-1]


class EurLexScraper:

    def __init__(self, url, headless=True, driver=None, index=None, total=None):
        self.original_url = url
        self.headless = headless
        self.driver = driver
        self.index = index
        self.total = total

    def setup_driver(self):
        if self.driver:
            return

        options = webdriver.ChromeOptions()

        if self.headless:
            options.add_argument('--headless=new')

        options.set_capability("pageLoadStrategy", "eager")
        options.add_argument("--disable-gpu")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-notifications")
        options.add_argument("--disable-background-networking")
        options.add_argument("--disable-background-timer-throttling")
        options.add_argument("--disable-renderer-backgrounding")
        options.add_argument("--disable-features=Translate,BackForwardCache")

        options.add_experimental_option("prefs", {
            "profile.managed_default_content_settings.images": 2,
            "profile.managed_default_content_settings.stylesheets": 2,
            "profile.managed_default_content_settings.fonts": 2,
            "profile.managed_default_content_settings.cookies": 1,
            "intl.accept_languages": "en,en_US"
        })

        options.add_argument("--log-level=3")

        self.driver = webdriver.Chrome(options=options)
        self.driver.implicitly_wait(10)

    def find_updated_version_link(self, max_depth=10, visited_urls=None):
        if visited_urls is None:
            visited_urls = set()

        if _stop_requested:
            print("Stop requested, halting version lookup")
            return None

        if max_depth <= 0:
            print(f"Max recursion depth reached")
            return None

        if self.driver is None:
            print("Driver not initialized")
            return None

        current_url = self.driver.current_url

        if current_url in visited_urls:
            print(f"Already visited {current_url}, stopping recursion")
            return None

        visited_urls.add(current_url)

        try:
            selectors = [
                "//text()[contains(., 'Current consolidated version')]/following::a[1]",
                "//*[contains(text(), 'Current consolidated version')]//following-sibling::a[1]",
                "//*[contains(text(), 'Current consolidated version')]//following::a[1]",
                "//div[contains(text(), 'newer version') or contains(text(), 'latest version')]//a",
            ]

            updated_version_url = None

            for selector in selectors:
                try:
                    element = self.driver.find_element(By.XPATH, selector)
                    href = element.get_attribute('href')

                    if href and ('/AUTO/' in href or '/eli/' in href or 'CELEX:02013R0575' in href):
                        if not href.startswith('http'):
                            href = 'https://eur-lex.europa.eu' + href
                        updated_version_url = href
                        break
                except NoSuchElementException:
                    continue

            if not updated_version_url:
                print(f"  ℹ No further updates found. Latest version: {current_url}")
                return None

            print(f"  → Found update: {updated_version_url}")
            print(f"  → Loading updated version... (depth: {11 - max_depth})")

            _set_progress(phase="Checking newer consolidated version", detail=updated_version_url)
            self.driver.get(updated_version_url)
            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )

            further_update = self.find_updated_version_link(max_depth - 1, visited_urls)

            return further_update if further_update else updated_version_url

        except Exception as e:
            print(f"Error finding updated version: {e}")
            return None

    def find_pdf_download_link(self):
        if self.driver is None:
            print("Driver not initialized")
            return None

        try:
            selectors = [
                "//a[contains(@href, '/legal-content/EN/TXT/PDF/')]",
                "//a[contains(@href, 'TXT/PDF') and contains(@href, 'CELEX')]",
                "//a[@title='PDF English']",
                "//a[contains(@title, 'PDF') and contains(@href, '/EN/')]",
                "//a[contains(@href, '.pdf') and contains(@href, '/EN/')]",
                "//a[contains(@href, 'pdf') and contains(@href, 'CELEX')]",
            ]

            for selector in selectors:
                try:
                    element = self.driver.find_element(By.XPATH, selector)
                    href = element.get_attribute('href')

                    if href and ('pdf' in href.lower() or 'PDF' in href):
                        if not href.startswith('http'):
                            href = 'https://eur-lex.europa.eu' + href
                        return href
                except NoSuchElementException:
                    continue

            return None

        except Exception as e:
            print(f"Error finding PDF link: {e}")
            return None

    def find_annex_anchors(self):
        if self.driver is None:
            print("Error: Driver not initialized")
            return []

        try:
            annex_links = []
            annex_ids = set()

            elements = self.driver.find_elements(By.XPATH, "//*[starts-with(@id, 'anx_')]")
            for element in elements:
                element_id = element.get_attribute('id')
                if element_id:
                    annex_ids.add(element_id)

            base_url = self.driver.current_url.split('#')[0]

            top_level_ids = []
            for element_id in sorted(annex_ids):
                parts = element_id.split('_')

                if len(parts) == 2:
                    top_level_ids.append(element_id)

                elif len(parts) > 2:
                    potential_parent = '_'.join(parts[:2])
                    if potential_parent not in annex_ids:
                        top_level_ids.append(element_id)

            for element_id in top_level_ids:
                annex_link = f"{base_url}#{element_id}"
                annex_links.append(annex_link)

            return annex_links

        except Exception as e:
            print(f"Error finding annex anchors: {e}")
            return []

    def scrape(self):
        regulation_name = extract_regulation_name(self.original_url)

        results = {
            'original_url': self.original_url,
            'regulation_name': regulation_name,
            'updated_version_url': None,
            'pdf_download_url': None,
            'annex_links': [],
            'is_large_document': False,
        }

        try:
            self.setup_driver()

            if self.driver is None:
                print("Error: Failed to initialize WebDriver")
                return results

            global _current_driver
            _current_driver = self.driver

            print(f"Loading page: {self.original_url}")
            print(f"Regulation: {regulation_name}")
            _set_progress(
                index=self.index, total=self.total, url=self.original_url,
                regulation_name=regulation_name, phase="Loading page", detail=self.original_url,
            )
            self.driver.get(self.original_url)

            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )

            print("Page loaded successfully")

            if _stop_requested:
                print("Stop requested, skipping remaining steps for this regulation")
                return results

            print("\nSearching for latest version (recursive)...")
            _set_progress(phase="Searching for latest consolidated version", detail="")
            updated_version = self.find_updated_version_link()
            results['updated_version_url'] = updated_version

            if updated_version:
                print(f"✓ Latest version found: {updated_version}")
            else:
                print("✓ Already on the latest version (no updates found)")

            if _stop_requested:
                print("Stop requested, skipping remaining steps for this regulation")
                return results

            print(f"\nSearching for PDF download link on current page...")
            _set_progress(phase="Searching for PDF download link", detail="")
            pdf_link = self.find_pdf_download_link()
            results['pdf_download_url'] = pdf_link
            if pdf_link:
                print(f"✓ Found PDF link: {pdf_link}")
            else:
                print("✗ No PDF link found")

            if _stop_requested:
                print("Stop requested, skipping remaining steps for this regulation")
                return results

            print(f"\nSearching for annex anchors on current page...")
            _set_progress(phase="Searching for annex anchors", detail="")
            annex_links = self.find_annex_anchors()
            results['annex_links'] = annex_links

            if annex_links:
                print(f"✓ Found {len(annex_links)} top-level annex anchor(s):")
                for link in annex_links:
                    print(f"  - {link}")
            else:
                print("✗ No annex anchors found")

        except TimeoutException:
            print("Error: Page load timeout")
        except Exception as e:
            print(f"Error during scraping: {e}")
        finally:
            if self.driver:
                try:
                    self.driver.quit()
                except Exception:
                    pass
            if _current_driver is self.driver:
                _current_driver = None

        return results


def main():
    global _scrape_running, _last_results, _last_run_at, _last_error, _stop_requested, _stopped

    with _scrape_lock:
        if _scrape_running:
            print("Scrape already running — returning cached results.")
            return _last_results if _last_results is not None else []

        _scrape_running = True

    _stop_requested = False
    _stopped = False
    total = len(REGULATION_URLS)
    _set_progress(index=0, total=total, url=None, regulation_name=None, phase="Starting scrape...", detail="")

    try:
        print("Starting Selenium scrape...")
        results = []

        for index, url in enumerate(REGULATION_URLS, start=1):
            if _stop_requested:
                _stopped = True
                break
            scraper = EurLexScraper(url, headless=True, index=index, total=total)
            results.append(scraper.scrape())
            if _stop_requested:
                _stopped = True
                break

        _last_results = results
        _last_run_at = datetime.now(timezone.utc).isoformat()
        _last_error = None
        return results
    except Exception as e:
        _last_error = str(e)
        raise
    finally:
        _set_progress(phase="Stopped" if _stopped else "Idle", detail="")
        with _scrape_lock:
            _scrape_running = False


if __name__ == "__main__":
    main()
