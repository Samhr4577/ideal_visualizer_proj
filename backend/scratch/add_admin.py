import os
from pymongo import MongoClient
from werkzeug.security import generate_password_hash
from dotenv import load_dotenv

# Load config
load_dotenv()
MONGO_URL = os.getenv("MONGODB_URL")
DB_NAME = os.getenv("DATABASE_NAME", "idealtredz")

client = MongoClient(MONGO_URL)
db = client[DB_NAME]
users_col = db["users"]

admin_data = {
    "name": "Admin",
    "mobile": "0000000000",
    "email": "admin@ideal.com",
    "password": generate_password_hash("admin123"),
    "created_at": 1714910000 # fixed timestamp
}

try:
    # Check if exists
    if users_col.find_one({"email": admin_data["email"]}):
        print(f"User {admin_data['email']} already exists.")
    else:
        users_col.insert_one(admin_data)
        print(f"Successfully added admin user: {admin_data['email']}")
except Exception as e:
    print(f"Error: {e}")

client.close()
