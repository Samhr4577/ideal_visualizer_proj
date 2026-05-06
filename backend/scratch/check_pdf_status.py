from pymongo import MongoClient
from bson import ObjectId
import os
from dotenv import load_dotenv

load_dotenv()
mongo_uri = os.getenv("MONGODB_URL")
db_name = os.getenv("DATABASE_NAME", "idealtredz")

client = MongoClient(mongo_uri)
db = client[db_name]
pdfs_col = db['pdfs']

# Find the latest PDF
pdf = pdfs_col.find_one(sort=[("_id", -1)])
if pdf:
    print(f"PDF ID: {pdf['_id']}")
    print(f"Status: {pdf.get('status')}")
    print(f"Page Count: {pdf.get('page_count')}")
    print(f"Processed Count: {pdf.get('processed_count')}")
    print(f"Pages: {len(pdf.get('pages', []))}")
else:
    print("No PDFs found.")
