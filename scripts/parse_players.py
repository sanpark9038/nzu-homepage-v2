
import re
from bs4 import BeautifulSoup

def parse_player_data(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        html_content = f.read()

    soup = BeautifulSoup(html_content, 'html.parser')
    
    rows = soup.find_all('tr')

    players = []
    for row in rows:
        # Find the 'a' tag with class 'p_name' which contains the player name and tier
        player_name_tag = row.find('a', class_='p_name')
        
        if not player_name_tag:
            continue

        # Extract raw text e.g., "조기석(갓)"
        raw_name_text = player_name_tag.get_text(strip=True)

        # Extract Tier and clean player name
        tier = 'N/A'
        player_name = raw_name_text
        tier_match = re.search(r'\((.*?)\)', raw_name_text)
        if tier_match:
            tier = tier_match.group(1)
            player_name = re.sub(r'\s*\((.*?)\)', '', raw_name_text).strip()

        # Find all `td` elements in the row to locate the race
        cells = row.find_all('td')
        
        race = 'N/A'
        university = 'N/A' # University is not available in this view

        if len(cells) > 1:
            # The race is typically in the second cell
            race_text = cells[1].get_text(strip=True)
            if 'Protoss' in race_text:
                race = 'Protoss'
            elif 'Terran' in race_text:
                race = 'Terran'
            elif 'Zerg' in race_text:
                race = 'Zerg'
            elif 'Random' in race_text:
                race = 'Random'
        
        player_info = {
            "name": player_name,
            "tier": tier,
            "race": race,
            "university": university # Will be enriched later
        }
        players.append(player_info)

    return players

if __name__ == "__main__":
    player_list = parse_player_data('.tmp/all_bj_list.html')
    if not player_list:
        print("No player data was parsed.")
    for player in player_list:
        print(player)
