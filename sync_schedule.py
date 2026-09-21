import pandas as pd
import firebase_admin
from firebase_admin import credentials, db
import os
import math

def sanitize_key(k):
    if not isinstance(k, str):
        k = str(k)
    for c in ['.', '#', '$', '[', ']']:
        k = k.replace(c, '')
    return k

def main():
    url = "https://docs.google.com/spreadsheets/d/1FyiqG6ArbYoEtmZWPnXjfwnjNNm1CO89pfz2WV2_bYY/export?format=xlsx"
    print("Downloading Excel from:", url)
    xls = pd.ExcelFile(url)
    
    # Process Sheet 0 (Daily)
    df_daily = pd.read_excel(xls, sheet_name=0)
    daily_data = {}
    timeslots = ['8am-10am', '10am-12pm', '12pm-1pm', '1pm-3pm', '3pm-5pm', '5pm-7pm']
    
    for idx, row in df_daily.iterrows():
        day_val = row.iloc[0]
        if pd.isna(day_val):
            continue
            
        if isinstance(day_val, pd.Timestamp):
            # Format as "24-Sep-Thursday"
            day_str = day_val.strftime('%d-%b-%A')
        else:
            day_str = str(day_val)
            
        day_str = sanitize_key(day_str)
        
        daily_data[day_str] = {}
        for ts in timeslots:
            # find matching column
            col = [c for c in df_daily.columns if str(c).replace(' ', '') == ts]
            if col:
                val = row[col[0]]
                if not pd.isna(val):
                    daily_data[day_str][ts] = str(val)
        
        if 'Comments' in df_daily.columns:
            val = row['Comments']
            if not pd.isna(val):
                daily_data[day_str]['Comments'] = str(val)

    # Process Sheet 1 (Weekly)
    df_weekly = pd.read_excel(xls, sheet_name=1)
    weekly_data = {}
    
    for idx, row in df_weekly.iterrows():
        day_val = row.iloc[0]
        if pd.isna(day_val):
            continue
        day_str = sanitize_key(str(day_val)).strip()
        
        if day_str not in weekly_data:
            weekly_data[day_str] = {}
            
        for ts in timeslots:
            col = [c for c in df_weekly.columns if str(c).replace(' ', '') == ts]
            if col:
                val = row[col[0]]
                if not pd.isna(val):
                    val_str = str(val).strip()
                    # ignore exactly two uppercase letters (slot indicators)
                    if len(val_str) == 2 and val_str.isupper():
                        continue
                    
                    if ts in weekly_data[day_str]:
                        weekly_data[day_str][ts] += " / " + val_str
                    else:
                        weekly_data[day_str][ts] = val_str

    schedule_payload = {'daily': daily_data, 'weekly': weekly_data}
    
    # Firebase Setup
    cred_path = os.environ.get("FIREBASE_CRED", "firebase_credentials.json")
    if not os.path.exists(cred_path):
        print("Warning: Firebase credentials not found. Payload generated but not pushed.")
        return
        
    cred = credentials.Certificate(cred_path)
    # The databaseURL needs to be known. For now, assume it's in the env or cred.
    # Usually it's required for db.reference
    # Let's try to initialize without databaseURL if possible, or print instructions
    firebase_admin.initialize_app(cred, {
        'databaseURL': os.environ.get("FIREBASE_DB_URL", "https://iit-madras-mba-planner-default-rtdb.firebaseio.com/")
    })
    
    ref = db.reference('schedule')
    ref.set(schedule_payload)
    print("Successfully pushed schedule payload to Firebase.")

if __name__ == "__main__":
    main()
