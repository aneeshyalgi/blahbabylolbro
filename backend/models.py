from dataclasses import dataclass
from typing import List, Any
from enum import Enum


class ColumnDataType(str, Enum):
    """Column data types"""
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    DATE = "date"
    MIXED = "mixed"


@dataclass
class ColumnInfo:
    """Column information"""
    name: str
    index: int
    data_type: ColumnDataType
    sample_values: List[Any]
    null_count: int
    total_count: int


@dataclass
class TableRegion:
    """Detected table region"""
    id: str
    name: str
    sheet: str
    start_row: int
    end_row: int
    start_col: int
    end_col: int
    columns: List[ColumnInfo]
    confidence: float
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "name": self.name,
            "sheet": self.sheet,
            "start_row": self.start_row,
            "end_row": self.end_row,
            "start_col": self.start_col,
            "end_col": self.end_col,
            "columns": [
                {
                    "name": col.name,
                    "index": col.index,
                    "data_type": col.data_type.value,
                    "sample_values": col.sample_values,
                    "null_count": col.null_count,
                    "total_count": col.total_count
                }
                for col in self.columns
            ],
            "confidence": self.confidence
        }
