"""
Semantic matching service for column descriptions using local sentence transformers model.

Uses:
  - backend/all-MiniLM-L6-v2  for the model
  - backend/abacus_embeddings.pkl  for cached Abacus field embeddings (load/save)
"""
import sqlite3
import numpy as np
from sentence_transformers import SentenceTransformer
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import pickle
import os

# Paths relative to this file (backend folder): backend/all-MiniLM-L6-v2, backend/abacus_embeddings.pkl
_BACKEND_DIR = Path(__file__).resolve().parent
_DEFAULT_MODEL_PATH = _BACKEND_DIR / "all-MiniLM-L6-v2"
_DEFAULT_DB_PATH = _BACKEND_DIR / "abacus_fields.db"
_DEFAULT_EMBEDDINGS_CACHE = _BACKEND_DIR / "abacus_embeddings.pkl"


class SemanticMatcher:
    def __init__(
        self,
        model_path: Optional[str] = None,
        db_path: Optional[str] = None,
        embeddings_cache_path: Optional[str] = None,
    ):
        """Initialize the semantic matcher. Uses backend/all-MiniLM-L6-v2 and backend/abacus_embeddings.pkl.
        If the cache file exists and contains both embeddings and abacus_data, the database is NOT required.
        """
        self.model_path = Path(model_path) if model_path else _DEFAULT_MODEL_PATH
        self.db_path = Path(db_path) if db_path else _DEFAULT_DB_PATH
        self.embeddings_cache_path = Path(embeddings_cache_path) if embeddings_cache_path else _DEFAULT_EMBEDDINGS_CACHE

        if not self.model_path.exists():
            raise FileNotFoundError(
                f"Model not found at {self.model_path}. "
                "Ensure the model is at backend/all-MiniLM-L6-v2."
            )

        print(f"Loading model from {self.model_path}...")
        self.model = SentenceTransformer(str(self.model_path))

        # Prefer cache: if abacus_embeddings.pkl exists and has both embeddings + abacus_data, we don't need the db
        self.abacus_data, self.abacus_embeddings = self._load_or_create_embeddings_and_data()
        if not self.abacus_data:
            raise ValueError(
                "No Abacus field data. Use backend/abacus_embeddings.pkl (with abacus_data inside) "
                "or provide backend/abacus_fields.db to build the cache."
            )
    
    def _load_abacus_fields_from_db(self) -> List[Dict[str, str]]:
        """Load field names and descriptions from abacus database (only needed when building cache)."""
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute("SELECT field, description FROM abacus_fields ORDER BY rowid")
        rows = cursor.fetchall()
        conn.close()
        return [
            {"field": str(row[0]) if row[0] is not None else "", "description": str(row[1]) if row[1] is not None else ""}
            for row in rows
        ]

    def _load_or_create_embeddings_and_data(self) -> Tuple[List[Dict[str, str]], np.ndarray]:
        """Load from backend/abacus_embeddings.pkl (embeddings + abacus_data), or build from db and save.
        Cache format: dict with "embeddings" and "abacus_data". When abacus_fields.db exists and cache
        is missing or legacy/mismatched, we always rebuild from the db so column titles map to real Abacus descriptions.
        """
        # If cache exists and is new format, use it (no db required)
        if self.embeddings_cache_path.exists():
            with open(self.embeddings_cache_path, "rb") as f:
                cached = pickle.load(f)
            if isinstance(cached, dict) and "embeddings" in cached and "abacus_data" in cached:
                abacus_data = cached["abacus_data"]
                if abacus_data and len(abacus_data) == len(cached["embeddings"]):
                    print("Using cached embeddings and Abacus data from", self.embeddings_cache_path.name)
                    return abacus_data, cached["embeddings"]
            # Legacy format (array only) or length mismatch: if db exists, rebuild from db and overwrite cache
            if self.db_path.exists():
                abacus_data = self._load_abacus_fields_from_db()
                if abacus_data:
                    print("Regenerating cache from abacus_fields.db (cache was legacy or mismatched)...")
                    texts = [f"{item['field']} {item['description']}" for item in abacus_data]
                    embeddings = self.model.encode(texts, show_progress_bar=True)
                    with open(self.embeddings_cache_path, "wb") as f:
                        pickle.dump({"embeddings": embeddings, "abacus_data": abacus_data}, f)
                    print("Cached embeddings and Abacus data to", self.embeddings_cache_path.name)
                    return abacus_data, embeddings
            # No db: use legacy cache with placeholder labels if lengths allow
            if isinstance(cached, np.ndarray) and len(cached) > 0:
                print("Using legacy cache with placeholder labels; add abacus_fields.db for real Abacus descriptions.")
                abacus_data = [
                    {"field": f"field_{i}", "description": f"Abacus field {i + 1}"}
                    for i in range(len(cached))
                ]
                return abacus_data, cached

        # No cache: build from db and save
        if not self.db_path.exists():
            raise FileNotFoundError(
                "No cache and no database. Put backend/abacus_fields.db in the backend folder to create the cache."
            )
        abacus_data = self._load_abacus_fields_from_db()
        if not abacus_data:
            raise ValueError("abacus_fields.db has no rows. Ensure table 'abacus_fields' has columns 'field' and 'description'.")
        print("Creating embeddings for Abacus fields from abacus_fields.db...")
        texts = [f"{item['field']} {item['description']}" for item in abacus_data]
        embeddings = self.model.encode(texts, show_progress_bar=True)
        with open(self.embeddings_cache_path, "wb") as f:
            pickle.dump({"embeddings": embeddings, "abacus_data": abacus_data}, f)
        print("Cached embeddings and Abacus data to", self.embeddings_cache_path.name)
        return abacus_data, embeddings
    
    def find_best_match(self, column_name: str, top_k: int = 1) -> List[Tuple[str, str, float]]:
        """
        Find the best matching abacus field for a given column name (semantic similarity).
        Returns list of (field_name, description, similarity_score).
        """
        if not column_name or not self.abacus_data:
            return []
        query_embedding = self.model.encode([str(column_name).strip() or " "])[0]
        norms = np.linalg.norm(self.abacus_embeddings, axis=1)
        qnorm = np.linalg.norm(query_embedding)
        if qnorm < 1e-12:
            return []
        similarities = np.dot(self.abacus_embeddings, query_embedding) / (norms * qnorm)
        np.nan_to_num(similarities, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
        top_indices = np.argsort(similarities)[-top_k:][::-1]
        return [
            (
                self.abacus_data[idx].get("field") or "",
                self.abacus_data[idx].get("description") or "",
                float(np.clip(similarities[idx], -1.0, 1.0)),
            )
            for idx in top_indices
        ]
    
    def match_columns(self, column_names: List[str], threshold: float = 0.3) -> Dict[str, Dict]:
        """
        Semantically match Excel column names to Abacus fields (field + description).
        Returns dict: column_name -> { "field", "description", "similarity" }.
        """
        results = {}
        for col_name in column_names:
            name = str(col_name).strip() if col_name is not None else ""
            if not name:
                results[col_name] = {"field": None, "description": None, "similarity": 0.0}
                continue
            matches = self.find_best_match(name, top_k=1)
            if matches and matches[0][2] >= threshold:
                field, description, score = matches[0]
                results[col_name] = {
                    "field": field or None,
                    "description": description or None,
                    "similarity": score,
                }
            else:
                results[col_name] = {"field": None, "description": None, "similarity": 0.0}
        return results

# Global instance
_matcher: Optional[SemanticMatcher] = None

def get_matcher() -> SemanticMatcher:
    """Get or create the global semantic matcher instance"""
    global _matcher
    if _matcher is None:
        try:
            _matcher = SemanticMatcher()
            print("Semantic matcher initialized successfully")
        except Exception as e:
            print(f"Warning: Could not initialize semantic matcher: {e}")
            raise
    return _matcher

def is_matcher_available() -> bool:
    """Check if semantic matcher can be initialized"""
    try:
        get_matcher()
        return True
    except Exception:
        return False
