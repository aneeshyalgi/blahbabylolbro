from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import re
import threading

_scrape_running = False
_scrape_lock = threading.Lock()
_last_results = None


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

    def __init__(self, url, headless=True, driver=None):
        self.original_url = url
        self.headless = headless
        self.driver = driver

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

            print(f"Loading page: {self.original_url}")
            print(f"Regulation: {regulation_name}")
            self.driver.get(self.original_url)

            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )

            print("Page loaded successfully")

            print("\nSearching for latest version (recursive)...")
            updated_version = self.find_updated_version_link()
            results['updated_version_url'] = updated_version

            if updated_version:
                print(f"✓ Latest version found: {updated_version}")
            else:
                print("✓ Already on the latest version (no updates found)")

            print(f"\nSearching for PDF download link on current page...")
            pdf_link = self.find_pdf_download_link()
            results['pdf_download_url'] = pdf_link
            if pdf_link:
                print(f"✓ Found PDF link: {pdf_link}")
            else:
                print("✗ No PDF link found")

            print(f"\nSearching for annex anchors on current page...")
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
                self.driver.quit()

        return results


def main():
    global _scrape_running, _last_results

    with _scrape_lock:
        if _scrape_running:
            print("Scrape already running — returning cached results.")
            return _last_results if _last_results is not None else []

        _scrape_running = True

    try:
        print("Starting Selenium scrape...")
        results = []

        urls = [
            "https://eur-lex.europa.eu/eli/reg/2013/575/oj/eng",
            "https://eur-lex.europa.eu/eli/reg_impl/2021/451/oj/eng",
        ]

        for url in urls:
            scraper = EurLexScraper(url, headless=True)
            results.append(scraper.scrape())

        _last_results = results
        return results
    finally:
        with _scrape_lock:
            _scrape_running = False


if __name__ == "__main__":
    main()
