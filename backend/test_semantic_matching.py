"""
Test script for semantic matching functionality
"""
import sys
from pathlib import Path

def test_model_availability():
    """Test if the model files exist"""
    model_path = Path("all-MiniLM-L6-v2")
    if not model_path.exists():
        print("❌ Model directory not found at:", model_path.absolute())
        return False
    
    required_files = ["config.json", "model.safetensors", "tokenizer.json"]
    for file in required_files:
        if not (model_path / file).exists():
            print(f"❌ Required model file missing: {file}")
            return False
    
    print("✓ Model files found")
    return True

def test_database():
    """Test if abacus_fields database exists and has data"""
    import sqlite3
    db_path = Path("abacus_fields.db")
    
    if not db_path.exists():
        print("❌ Database not found at:", db_path.absolute())
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT COUNT(*) FROM abacus_fields")
        count = cursor.fetchone()[0]
        print(f"✓ Database found with {count} abacus fields")
        
        # Show sample fields
        cursor.execute("SELECT field, description FROM abacus_fields LIMIT 3")
        print("\nSample fields:")
        for row in cursor.fetchall():
            print(f"  - {row[0]}: {row[1][:80]}...")
        
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Database error: {e}")
        conn.close()
        return False

def test_semantic_matcher():
    """Test if semantic matcher can be initialized"""
    try:
        print("\n--- Testing Semantic Matcher ---")
        from semantic_matcher import get_matcher
        
        print("Initializing matcher...")
        matcher = get_matcher()
        
        # Test matching
        test_columns = ["Account Number", "Customer Name", "Transaction Amount", "Maturity Date"]
        print(f"\nTesting with columns: {test_columns}")
        
        results = matcher.match_columns(test_columns, threshold=0.3)
        
        print("\nMatching Results:")
        for col, match in results.items():
            if match['field']:
                print(f"\n  {col} →")
                print(f"    Field: {match['field']}")
                print(f"    Score: {match['similarity']:.2%}")
                print(f"    Description: {match['description'][:100]}...")
            else:
                print(f"\n  {col} → No match found")
        
        print("\n✓ Semantic matcher working correctly")
        return True
        
    except Exception as e:
        print(f"❌ Semantic matcher error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_database_schema():
    """Test if column_mappings table exists in rwa_data.db"""
    import sqlite3
    db_path = Path("rwa_data.db")
    
    if not db_path.exists():
        print("❌ Main database not found")
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='column_mappings'")
        result = cursor.fetchone()
        
        if result:
            print("✓ column_mappings table exists")
            
            # Show table structure
            cursor.execute("PRAGMA table_info(column_mappings)")
            columns = cursor.fetchall()
            print("\nTable structure:")
            for col in columns:
                print(f"  - {col[1]} ({col[2]})")
            
            conn.close()
            return True
        else:
            print("❌ column_mappings table not found")
            conn.close()
            return False
            
    except Exception as e:
        print(f"❌ Database schema error: {e}")
        conn.close()
        return False

if __name__ == "__main__":
    print("=== Semantic Matching Test Suite ===\n")
    
    tests = [
        ("Model Files", test_model_availability),
        ("Abacus Database", test_database),
        ("Database Schema", test_database_schema),
        ("Semantic Matcher", test_semantic_matcher),
    ]
    
    results = []
    for name, test_func in tests:
        print(f"\n--- Testing {name} ---")
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"❌ Test failed with exception: {e}")
            results.append((name, False))
    
    print("\n\n=== Test Summary ===")
    for name, result in results:
        status = "✓ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    all_passed = all(result for _, result in results)
    if all_passed:
        print("\n🎉 All tests passed! Semantic matching is ready to use.")
    else:
        print("\n⚠️  Some tests failed. Please fix the issues above.")
    
    sys.exit(0 if all_passed else 1)
