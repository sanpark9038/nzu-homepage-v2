import json
from bs4 import BeautifulSoup
import re
import os

def parse_stats():
    file_path = 'aegong_stats_utf8.html'
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')
    
    # Locate the main list-board (여성밀리전적)
    # The first div with class list-board is the main one.
    list_board = soup.find('div', class_='list-board')
    if not list_board:
        print("Could not find list-board")
        return

    table = list_board.find('table')
    if not table:
        print("Could not find table")
        return

    # In Eloboard, rows often have this style for the main list
    rows = table.find_all('tr', style=re.compile(r'border-bottom:1px solid #CCC;'))
    
    results = []
    
    for row in rows:
        cols = row.find_all('td')
        if len(cols) < 6:
            continue
            
        date_cell = cols[0]
        opponent_cell = cols[1]
        map_cell = cols[2]
        # elo_cell = cols[3]
        # format_cell = cols[4]
        memo_cell = cols[5]
        
        date = date_cell.get_text(strip=True)
        # Filter dates from 2025-01-01 onwards
        if date < "2025-01-01":
            continue
            
        # Win/Loss based on background color
        style = date_cell.get('style', '')
        if 'background:#0CF' in style:
            result = "승리"
        elif 'background:#434348' in style:
            result = "패배"
        else:
            result = "알수없음"
            
        # Opponent and Race
        opponent_text = opponent_cell.get_text(strip=True)
        # Pattern like "모꿀몬(T)"
        match = re.search(r'(.+)\((.+)\)', opponent_text)
        if match:
            opponent_name = match.group(1).strip()
            opponent_race = match.group(2).strip()
        else:
            opponent_name = opponent_text.strip()
            opponent_race = ""
            
        match_record = {
            "date": date,
            "opponent": opponent_name,
            "opponent_race": opponent_race,
            "map": map_cell.get_text(strip=True),
            "result": result,
            "remarks": memo_cell.get_text(strip=True)
        }
        results.append(match_record)
        
    output_path = 'aegong_extracted_stats.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully extracted {len(results)} matches to {output_path}.")
    
    wins = len([r for r in results if r['result'] == "승리"])
    losses = len([r for r in results if r['result'] == "패배"])
    print(f"Wins: {wins}, Losses: {losses}, Total: {len(results)}")

if __name__ == "__main__":
    parse_stats()
