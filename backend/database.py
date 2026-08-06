import sqlite3
import json
import os
from pathlib import Path
from typing import Dict, List, Any
import pandas as pd

APP_DATA_ROOT = Path(os.environ.get("APP_DATA_ROOT", Path(__file__).parent))
DATABASE_PATH = Path(os.environ.get("RWA_DATABASE_PATH", str(APP_DATA_ROOT / "rwa_data.db")))

def get_db_connection():
    """Get a connection to the SQLite database."""
    conn = sqlite3.connect(DATABASE_PATH, timeout=30.0)  # 30 second timeout
    conn.row_factory = sqlite3.Row
    return conn

def initialize_database():
    """Initialize the database with required tables."""
    import time
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            
            # Create datasets metadata table with version
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS datasets (
                    id TEXT PRIMARY KEY,
                    user_name TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    upload_date TEXT NOT NULL,
                    metadata TEXT NOT NULL,
                    version TEXT DEFAULT 'v1.0.0'
                )
            """)
            
            # Create code files metadata table with version
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS code_files (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    upload_date TEXT NOT NULL,
                    version TEXT DEFAULT 'v1.0.0',
                    description TEXT
                )
            """)
            
            # Create execution results metadata table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS execution_results (
                    id TEXT PRIMARY KEY,
                    dataset_id TEXT NOT NULL,
                    code_id TEXT NOT NULL,
                    execution_date TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    FOREIGN KEY (dataset_id) REFERENCES datasets(id),
                    FOREIGN KEY (code_id) REFERENCES code_files(id)
                )
            """)
            
            # Create clusters table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS clusters (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    reporting_date TEXT NOT NULL,
                    dataset_id TEXT NOT NULL,
                    code_id TEXT,
                    created_date TEXT NOT NULL,
                    description TEXT,
                    is_reference INTEGER DEFAULT 0,
                    FOREIGN KEY (dataset_id) REFERENCES datasets(id),
                    FOREIGN KEY (code_id) REFERENCES code_files(id)
                )
            """)
            
            # Create cluster executions junction table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS cluster_executions (
                    id TEXT PRIMARY KEY,
                    cluster_id TEXT NOT NULL,
                    execution_id TEXT NOT NULL,
                    executed_date TEXT NOT NULL,
                    FOREIGN KEY (cluster_id) REFERENCES clusters(id),
                    FOREIGN KEY (execution_id) REFERENCES execution_results(id)
                )
            """)
            
            # Create column mappings table for semantic matching
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS column_mappings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    dataset_id TEXT NOT NULL,
                    table_id TEXT NOT NULL,
                    column_name TEXT NOT NULL,
                    abacus_field TEXT,
                    abacus_description TEXT,
                    similarity_score REAL,
                    created_date TEXT NOT NULL,
                    FOREIGN KEY (dataset_id) REFERENCES datasets(id)
                )
            """)

            # Create users table for local authentication
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_date TEXT NOT NULL
                )
            """)
            
            # Migrate existing tables - add version columns if they don't exist
            try:
                # Check if version column exists in datasets
                cursor.execute("PRAGMA table_info(datasets)")
                columns = [row[1] for row in cursor.fetchall()]
                if 'version' not in columns:
                    cursor.execute("ALTER TABLE datasets ADD COLUMN version TEXT DEFAULT 'v1.0.0'")
            except Exception as e:
                print(f"Migration note for datasets: {e}")
        
            try:
                # Check if version column exists in code_files
                cursor.execute("PRAGMA table_info(code_files)")
                columns = [row[1] for row in cursor.fetchall()]
                if 'version' not in columns:
                    cursor.execute("ALTER TABLE code_files ADD COLUMN version TEXT DEFAULT 'v1.0.0'")
                if 'description' not in columns:
                    cursor.execute("ALTER TABLE code_files ADD COLUMN description TEXT")
            except Exception as e:
                print(f"Migration note for code_files: {e}")

            # Migrate clusters.code_id to nullable when needed.
            try:
                cursor.execute("PRAGMA table_info(clusters)")
                cluster_cols = cursor.fetchall()
                code_col = next((row for row in cluster_cols if row[1] == 'code_id'), None)
                # PRAGMA table_info: [cid, name, type, notnull, dflt_value, pk]
                code_id_notnull = bool(code_col[3]) if code_col is not None else False
                if code_id_notnull:
                    cursor.execute("PRAGMA foreign_keys=OFF")
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS clusters_new (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            reporting_date TEXT NOT NULL,
                            dataset_id TEXT NOT NULL,
                            code_id TEXT,
                            created_date TEXT NOT NULL,
                            description TEXT,
                            is_reference INTEGER DEFAULT 0,
                            FOREIGN KEY (dataset_id) REFERENCES datasets(id),
                            FOREIGN KEY (code_id) REFERENCES code_files(id)
                        )
                    """)
                    cursor.execute("""
                        INSERT INTO clusters_new (id, name, reporting_date, dataset_id, code_id, created_date, description, is_reference)
                        SELECT id, name, reporting_date, dataset_id, code_id, created_date, description, is_reference
                        FROM clusters
                    """)
                    cursor.execute("DROP TABLE clusters")
                    cursor.execute("ALTER TABLE clusters_new RENAME TO clusters")
                    cursor.execute("PRAGMA foreign_keys=ON")
            except Exception as e:
                print(f"Migration note for clusters: {e}")
            
            conn.commit()
            conn.close()
            return  # Success, exit the retry loop
        
        except sqlite3.OperationalError as e:
            if "database is locked" in str(e):
                retry_count += 1
                if retry_count < max_retries:
                    print(f"[database] Database is locked, retrying ({retry_count}/{max_retries})...")
                    time.sleep(1)  # Wait 1 second before retrying
                else:
                    print(f"[database] Failed to initialize after {max_retries} attempts, continuing anyway")
                    return
            else:
                raise
        except Exception as e:
            print(f"[database] Error initializing database: {e}")
            return

def store_dataset(dataset_id: str, user_name: str, filename: str, upload_date: str, metadata: Dict, version: str = "v1.0.0"):
    """Store dataset metadata and create table for input data."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Store metadata
    cursor.execute("""
        INSERT INTO datasets (id, user_name, filename, upload_date, metadata, version)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (dataset_id, user_name, filename, upload_date, json.dumps(metadata), version))
    
    conn.commit()
    conn.close()

def store_table_data(dataset_name: str, table_id: str, data_type: str, df: pd.DataFrame):
    """
    Store table data in SQLite with naming pattern: {dataset_name}_{table_id}_{data_type}
    data_type can be: 'input_data' or 'output_data'
    """
    conn = get_db_connection()
    
    # Sanitize dataset name for use in table name
    safe_name = dataset_name.replace(" ", "_").replace("-", "_")
    safe_table_id = table_id.replace(" ", "_").replace("-", "_")
    table_name = f"{safe_name}_{safe_table_id}_{data_type}"
    
    # Store DataFrame to SQLite
    df.to_sql(table_name, conn, if_exists='replace', index=False)
    
    conn.close()
    return table_name

def get_table_data(dataset_name: str, table_id: str, data_type: str) -> pd.DataFrame:
    """Retrieve table data from SQLite."""
    conn = get_db_connection()
    
    safe_name = dataset_name.replace(" ", "_").replace("-", "_")
    safe_table_id = table_id.replace(" ", "_").replace("-", "_")
    table_name = f"{safe_name}_{safe_table_id}_{data_type}"
    
    try:
        df = pd.read_sql_query(f"SELECT * FROM {table_name}", conn)
    except Exception as e:
        print(f"Error reading table {table_name}: {e}")
        df = pd.DataFrame()
    finally:
        conn.close()
    
    return df

def get_all_datasets() -> List[Dict]:
    """Get all datasets from the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, user_name, filename, upload_date, version FROM datasets ORDER BY upload_date DESC")
    rows = cursor.fetchall()
    
    datasets = []
    for row in rows:
        datasets.append({
            "id": row["id"],
            "user_name": row["user_name"],
            "filename": row["filename"],
            "upload_date": row["upload_date"],
            "version": row["version"]
        })
    
    conn.close()
    return datasets


def get_dataset_by_name(name: str) -> Dict:
    """Get a dataset by user-visible name (case-insensitive, trimmed)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT id, user_name, filename, upload_date, version
        FROM datasets
        WHERE LOWER(TRIM(user_name)) = LOWER(TRIM(?))
        LIMIT 1
        """,
        (name,),
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    return {
        "id": row["id"],
        "user_name": row["user_name"],
        "filename": row["filename"],
        "upload_date": row["upload_date"],
        "version": row["version"],
    }

def get_dataset_metadata(dataset_id: str) -> Dict:
    """Get dataset metadata including detected tables."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT metadata, user_name FROM datasets WHERE id = ?", (dataset_id,))
    row = cursor.fetchone()
    
    conn.close()
    
    if row:
        metadata = json.loads(row["metadata"])
        metadata["user_name"] = row["user_name"]
        return metadata
    return None


def update_dataset_metadata(dataset_id: str, metadata: Dict) -> bool:
    """Update dataset metadata JSON blob."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        "UPDATE datasets SET metadata = ? WHERE id = ?",
        (json.dumps(metadata), dataset_id),
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def delete_dataset(dataset_id: str) -> bool:
    """
    Delete a dataset and all dependent data.
    Order: cluster_executions (for executions of this dataset), execution_results,
           cluster_executions (for clusters using this dataset), clusters,
           column_mappings, dynamic table-data tables, datasets row.
    Returns True if deleted, False if dataset not found.
    """
    metadata = get_dataset_metadata(dataset_id)
    if not metadata:
        return False

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 1) Cluster executions that reference execution_results for this dataset
        cursor.execute(
            "DELETE FROM cluster_executions WHERE execution_id IN (SELECT id FROM execution_results WHERE dataset_id = ?)",
            (dataset_id,),
        )
        # 2) Execution results for this dataset
        cursor.execute("DELETE FROM execution_results WHERE dataset_id = ?", (dataset_id,))
        # 3) Cluster executions for clusters that use this dataset
        cursor.execute(
            "DELETE FROM cluster_executions WHERE cluster_id IN (SELECT id FROM clusters WHERE dataset_id = ?)",
            (dataset_id,),
        )
        # 4) Clusters that use this dataset
        cursor.execute("DELETE FROM clusters WHERE dataset_id = ?", (dataset_id,))
        # 5) Column mappings for this dataset
        cursor.execute("DELETE FROM column_mappings WHERE dataset_id = ?", (dataset_id,))

        # 6) Drop dynamic tables (input_data and output_data per table)
        user_name = metadata.get("user_name") or ""
        safe_name = user_name.replace(" ", "_").replace("-", "_")
        tables = metadata.get("tables") or []
        for t in tables:
            table_id = t.get("id") or t.get("name") or ""
            safe_table_id = table_id.replace(" ", "_").replace("-", "_")
            for suffix in ("input_data", "output_data"):
                table_name = f"{safe_name}_{safe_table_id}_{suffix}"
                try:
                    cursor.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                except Exception as e:
                    print(f"Note: could not drop table {table_name}: {e}")

        # 7) Delete dataset row
        cursor.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def store_code_file(code_id: str, filename: str, upload_date: str, version: str = "v1.0.0", description: str = ""):
    """Store code file metadata."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO code_files (id, filename, upload_date, version, description)
        VALUES (?, ?, ?, ?, ?)
    """, (code_id, filename, upload_date, version, description))
    
    conn.commit()
    conn.close()

def get_all_code_files() -> List[Dict]:
    """Get all code files from the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, filename, upload_date, version, description FROM code_files ORDER BY upload_date DESC")
    rows = cursor.fetchall()
    
    code_files = []
    for row in rows:
        code_files.append({
            "id": row["id"],
            "filename": row["filename"],
            "upload_date": row["upload_date"],
            "version": row["version"],
            "description": row["description"] or ""
        })
    
    conn.close()
    return code_files


def delete_code_file(code_id: str) -> bool:
    """
    Delete a code file and all dependent data.
    Order: cluster_executions (for clusters using this code), clusters, execution_results, code_files.
    Returns True if deleted, False if not found.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM code_files WHERE id = ?", (code_id,))
        if cursor.fetchone() is None:
            return False
        # 1) Cluster executions for clusters that use this code
        cursor.execute(
            "DELETE FROM cluster_executions WHERE cluster_id IN (SELECT id FROM clusters WHERE code_id = ?)",
            (code_id,),
        )
        # 2) Clusters that use this code
        cursor.execute("DELETE FROM clusters WHERE code_id = ?", (code_id,))
        # 3) Execution results that use this code
        cursor.execute("DELETE FROM execution_results WHERE code_id = ?", (code_id,))
        # 4) Code file row
        cursor.execute("DELETE FROM code_files WHERE id = ?", (code_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def store_execution_result(result_id: str, dataset_id: str, code_id: str, 
                          execution_date: str, dataset_name: str, table_id: str,
                          result_df: pd.DataFrame, summary: Dict):
    """Store execution results."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Store result metadata
    cursor.execute("""
        INSERT INTO execution_results (id, dataset_id, code_id, execution_date, summary)
        VALUES (?, ?, ?, ?, ?)
    """, (result_id, dataset_id, code_id, execution_date, json.dumps(summary)))
    
    conn.commit()
    conn.close()
    
    # Store result data in SQLite table
    store_table_data(dataset_name, table_id, "output_data", result_df)

# Cluster management functions
def create_cluster(cluster_id: str, name: str, reporting_date: str, dataset_id: str, 
                  code_id: str = None, created_date: str = "", description: str = "", is_reference: int = 0):
    """Create a new cluster configuration."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO clusters (id, name, reporting_date, dataset_id, code_id, created_date, description, is_reference)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (cluster_id, name, reporting_date, dataset_id, code_id, created_date, description, is_reference))
    
    conn.commit()
    conn.close()

def get_all_clusters(search: str = None) -> List[Dict]:
    """Get all clusters, optionally filtered by search term."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if search:
        query = """
            SELECT c.*, d.user_name as dataset_name, d.version as dataset_version,
                   cf.filename as code_filename, cf.version as code_version
            FROM clusters c
            LEFT JOIN datasets d ON c.dataset_id = d.id
            LEFT JOIN code_files cf ON c.code_id = cf.id
            WHERE c.name LIKE ? OR c.description LIKE ?
            ORDER BY c.created_date DESC
        """
        cursor.execute(query, (f"%{search}%", f"%{search}%"))
    else:
        query = """
            SELECT c.*, d.user_name as dataset_name, d.version as dataset_version,
                   cf.filename as code_filename, cf.version as code_version
            FROM clusters c
            LEFT JOIN datasets d ON c.dataset_id = d.id
            LEFT JOIN code_files cf ON c.code_id = cf.id
            ORDER BY c.created_date DESC
        """
        cursor.execute(query)
    
    rows = cursor.fetchall()
    clusters = []
    for row in rows:
        clusters.append({
            "id": row["id"],
            "name": row["name"],
            "reporting_date": row["reporting_date"],
            "dataset_id": row["dataset_id"],
            "dataset_name": row["dataset_name"],
            "dataset_version": row["dataset_version"],
            "code_id": row["code_id"],
            "code_filename": row["code_filename"],
            "code_version": row["code_version"],
            "created_date": row["created_date"],
            "description": row["description"] or "",
            "is_reference": bool(row["is_reference"])
        })
    
    conn.close()
    return clusters

def get_cluster(cluster_id: str) -> Dict:
    """Get a specific cluster by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT c.*, d.user_name as dataset_name, d.version as dataset_version,
               cf.filename as code_filename, cf.version as code_version
        FROM clusters c
        LEFT JOIN datasets d ON c.dataset_id = d.id
        LEFT JOIN code_files cf ON c.code_id = cf.id
        WHERE c.id = ?
    """
    cursor.execute(query, (cluster_id,))
    row = cursor.fetchone()
    
    conn.close()
    
    if row:
        return {
            "id": row["id"],
            "name": row["name"],
            "reporting_date": row["reporting_date"],
            "dataset_id": row["dataset_id"],
            "dataset_name": row["dataset_name"],
            "dataset_version": row["dataset_version"],
            "code_id": row["code_id"],
            "code_filename": row["code_filename"],
            "code_version": row["code_version"],
            "created_date": row["created_date"],
            "description": row["description"] or "",
            "is_reference": bool(row["is_reference"])
        }
    return None

def get_cluster_by_name(name: str) -> Dict:
    """Get a specific cluster by exact name (case-insensitive, trimmed)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
        SELECT c.*, d.user_name as dataset_name, d.version as dataset_version,
               cf.filename as code_filename, cf.version as code_version
        FROM clusters c
        LEFT JOIN datasets d ON c.dataset_id = d.id
        LEFT JOIN code_files cf ON c.code_id = cf.id
        WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(?))
        LIMIT 1
    """
    cursor.execute(query, (name,))
    row = cursor.fetchone()

    conn.close()

    if row:
        return {
            "id": row["id"],
            "name": row["name"],
            "reporting_date": row["reporting_date"],
            "dataset_id": row["dataset_id"],
            "dataset_name": row["dataset_name"],
            "dataset_version": row["dataset_version"],
            "code_id": row["code_id"],
            "code_filename": row["code_filename"],
            "code_version": row["code_version"],
            "created_date": row["created_date"],
            "description": row["description"] or "",
            "is_reference": bool(row["is_reference"])
        }
    return None

def update_cluster(cluster_id: str, updates: Dict):
    """Update cluster fields."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    set_clauses = []
    values = []
    
    for key, value in updates.items():
        if key in ["name", "reporting_date", "dataset_id", "code_id", "description", "is_reference"]:
            set_clauses.append(f"{key} = ?")
            values.append(value)
    
    if set_clauses:
        values.append(cluster_id)
        query = f"UPDATE clusters SET {', '.join(set_clauses)} WHERE id = ?"
        cursor.execute(query, values)
        conn.commit()
    
    conn.close()

def delete_cluster(cluster_id: str):
    """Delete a cluster and its execution history."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Delete cluster executions first (foreign key constraint)
    cursor.execute("DELETE FROM cluster_executions WHERE cluster_id = ?", (cluster_id,))
    
    # Delete cluster
    cursor.execute("DELETE FROM clusters WHERE id = ?", (cluster_id,))
    
    conn.commit()
    conn.close()

def store_cluster_execution(execution_id: str, cluster_id: str, result_execution_id: str, executed_date: str):
    """Link an execution result to a cluster."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO cluster_executions (id, cluster_id, execution_id, executed_date)
        VALUES (?, ?, ?, ?)
    """, (execution_id, cluster_id, result_execution_id, executed_date))
    
    conn.commit()
    conn.close()


def delete_cluster_execution(cluster_execution_id: str) -> bool:
    """Delete a single cluster execution (link) by its id. Does not delete the execution result itself."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM cluster_executions WHERE id = ?", (cluster_execution_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        return deleted
    finally:
        conn.close()


def delete_cluster_executions_for_cluster(cluster_id: str) -> int:
    """Delete all execution links for a specific cluster."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM cluster_executions WHERE cluster_id = ?", (cluster_id,))
        deleted = cursor.rowcount
        conn.commit()
        return deleted
    finally:
        conn.close()


def delete_cluster_executions_for_dataset(dataset_id: str) -> int:
    """Delete cluster execution links that point to execution results for a specific dataset."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            DELETE FROM cluster_executions
            WHERE execution_id IN (
                SELECT id FROM execution_results WHERE dataset_id = ?
            )
            """,
            (dataset_id,),
        )
        deleted = cursor.rowcount
        conn.commit()
        return deleted
    finally:
        conn.close()

def get_cluster_executions(cluster_id: str) -> List[Dict]:
    """Get all executions for a specific cluster."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT ce.*, er.summary, er.execution_date,
               d.user_name as dataset_name, d.version as dataset_version,
               cf.filename as code_filename, cf.version as code_version
        FROM cluster_executions ce
        LEFT JOIN execution_results er ON ce.execution_id = er.id
        LEFT JOIN datasets d ON er.dataset_id = d.id
        LEFT JOIN code_files cf ON er.code_id = cf.id
        WHERE ce.cluster_id = ?
        ORDER BY ce.executed_date DESC
    """
    cursor.execute(query, (cluster_id,))
    rows = cursor.fetchall()
    
    executions = []
    for row in rows:
        summary = json.loads(row["summary"]) if row["summary"] else {}
        executions.append({
            "id": row["id"],
            "execution_id": row["execution_id"],
            "executed_date": row["executed_date"],
            "dataset_name": row["dataset_name"],
            "dataset_version": row["dataset_version"],
            "code_filename": row["code_filename"],
            "code_version": row["code_version"],
            "summary": summary
        })
    
    conn.close()
    return executions


def get_all_cluster_executions() -> List[Dict]:
    """Get all executions from all clusters (for Results tab / global execution list)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    query = """
        SELECT ce.*, er.summary, er.execution_date,
               d.user_name as dataset_name, d.version as dataset_version,
               cf.filename as code_filename, cf.version as code_version,
               c.name as cluster_name, c.reporting_date as cluster_reporting_date
        FROM cluster_executions ce
        LEFT JOIN execution_results er ON ce.execution_id = er.id
        LEFT JOIN datasets d ON er.dataset_id = d.id
        LEFT JOIN code_files cf ON er.code_id = cf.id
        LEFT JOIN clusters c ON ce.cluster_id = c.id
        ORDER BY ce.executed_date DESC
    """
    cursor.execute(query)
    rows = cursor.fetchall()
    executions = []
    for row in rows:
        summary = json.loads(row["summary"]) if row["summary"] else {}
        executions.append({
            "id": row["id"],
            "cluster_id": row["cluster_id"],
            "cluster_name": row["cluster_name"],
            "cluster_reporting_date": row["cluster_reporting_date"],
            "execution_id": row["execution_id"],
            "executed_date": row["executed_date"],
            "dataset_name": row["dataset_name"],
            "dataset_version": row["dataset_version"],
            "code_filename": row["code_filename"],
            "code_version": row["code_version"],
            "summary": summary,
        })
    conn.close()
    return executions


def store_column_mappings(dataset_id: str, table_id: str, mappings: Dict[str, Dict], created_date: str):
    """Store semantic column mappings for a dataset table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    for column_name, match_info in mappings.items():
        cursor.execute("""
            INSERT INTO column_mappings 
            (dataset_id, table_id, column_name, abacus_field, abacus_description, similarity_score, created_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            dataset_id, 
            table_id, 
            column_name,
            match_info.get('field'),
            match_info.get('description'),
            match_info.get('similarity', 0.0),
            created_date
        ))
    
    conn.commit()
    conn.close()

def get_column_mappings(dataset_id: str, table_id: str = None) -> List[Dict]:
    """Get column mappings for a dataset or specific table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if table_id:
        cursor.execute("""
            SELECT * FROM column_mappings 
            WHERE dataset_id = ? AND table_id = ?
            ORDER BY column_name
        """, (dataset_id, table_id))
    else:
        cursor.execute("""
            SELECT * FROM column_mappings 
            WHERE dataset_id = ?
            ORDER BY table_id, column_name
        """, (dataset_id,))
    
    rows = cursor.fetchall()
    
    mappings = []
    for row in rows:
        mappings.append({
            "id": row["id"],
            "dataset_id": row["dataset_id"],
            "table_id": row["table_id"],
            "column_name": row["column_name"],
            "abacus_field": row["abacus_field"],
            "abacus_description": row["abacus_description"],
            "similarity_score": row["similarity_score"],
            "created_date": row["created_date"]
        })
    
    conn.close()
    return mappings

# Initialize database on module import
initialize_database()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def get_user(username: str):
    """Return the user row dict for the given username, or None."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_user(username: str, password_hash: str):
    """Insert a new user. Raises if username already exists."""
    from datetime import datetime, timezone
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO users (username, password_hash, created_date) VALUES (?, ?, ?)",
        (username, password_hash, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()


def seed_default_user():
    """Create the default admin user from env vars if it doesn't exist yet."""
    import os
    from passlib.context import CryptContext
    admin_username = os.environ.get("ADMIN_USERNAME", "admin")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    if get_user(admin_username) is None:
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        create_user(admin_username, pwd_context.hash(admin_password))
        print(f"[auth] Seeded default user '{admin_username}'")

