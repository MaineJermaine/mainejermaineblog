import sqlalchemy as sa
from sqlalchemy.orm import declarative_base
import os

# --- CONFIG ---
SQLITE_PATH = 'instance/blog.db'
if not os.path.exists(SQLITE_PATH) and os.path.exists('blog.db'):
    SQLITE_PATH = 'blog.db'
elif not os.path.exists(SQLITE_PATH):
    print("❌ ERROR: Could not find your SQLite database file!")
    exit()

PG_URL = os.environ.get('DATABASE_URL')
if PG_URL and PG_URL.startswith('postgres://'):
    PG_URL = PG_URL.replace('postgres://', 'postgresql://', 1)

if not PG_URL:
    print("❌ ERROR: Set your DATABASE_URL environment variable first!")
    exit()

print(f"🔄 Migrating from {SQLITE_PATH} to Render...")

sqlite_engine = sa.create_engine(f'sqlite:///{SQLITE_PATH}')
pg_engine     = sa.create_engine(PG_URL)

metadata = sa.MetaData()
metadata.reflect(bind=sqlite_engine)

tables = ['profile', 'post', 'obsession', 'reading_item', 'subscriber', 'song_of_week']

with pg_engine.connect() as pg_conn:
    for table_name in tables:
        if table_name not in metadata.tables:
            print(f"⚠️ Table '{table_name}' skipped (not found).")
            continue
            
        print(f"📦 Migrating '{table_name}'...")
        table = metadata.tables[table_name]
        
        with sqlite_engine.connect() as sqlite_conn:
            # Read all rows using SQLAlchemy 2.0 select statement
            stmt = sa.select(table)
            result = sqlite_conn.execute(stmt)
            rows = result.all()
            
            if not rows:
                print(f"   (No data in '{table_name}')")
                continue

            # Clear Postgres table
            try:
                pg_conn.execute(sa.text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE"))
                pg_conn.commit()
            except:
                pass

            # Insert batch
            # Convert Row objects to dictionaries for insertion
            records = [dict(row._mapping) for row in rows]
            pg_conn.execute(table.insert(), records)
            pg_conn.commit()
            print(f"   ✅ Successfully moved {len(records)} records.")

print("\n🚀 DONE! Your Render blog is now live with all your local data.")
