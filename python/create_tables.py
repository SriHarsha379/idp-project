from db import engine
from db import Base

from models import UploadMetadata, ExtractedDocs  # Import your models

# Create all tables in the database (based on models)
Base.metadata.create_all(bind=engine)

print("Tables created successfully!")
