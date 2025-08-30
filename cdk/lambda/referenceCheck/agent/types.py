from pydantic import BaseModel
from typing import Optional


class QueryKnowledgeBaseOutput(BaseModel):
    message: str
    relatedDocument: Optional[str]
    reviewComment: Optional[str]
    related: bool
