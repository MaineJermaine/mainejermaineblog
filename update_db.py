import sqlite3
import os

db_path = 'instance/blog.db'
if not os.path.exists(db_path):
    db_path = 'blog.db'

conn = sqlite3.connect(db_path)
c = conn.cursor()
try:
    c.execute("ALTER TABLE profile ADD COLUMN collections TEXT DEFAULT '[\"Main\", \"Poetry\", \"Art\", \"Ramblings\"]'")
except Exception as e:
    print(e)
try:
    c.execute("ALTER TABLE profile ADD COLUMN bg_type TEXT DEFAULT 'preset'")
except Exception as e:
    print(e)
try:
    c.execute("ALTER TABLE profile ADD COLUMN bg_val TEXT DEFAULT 'default'")
except Exception as e:
    print(e)

conn.commit()
conn.close()
