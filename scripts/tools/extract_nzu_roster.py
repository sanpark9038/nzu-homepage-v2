import requests
from bs4 import BeautifulSoup
import re

def extract_nzu_roster(targets):
    url = "https://eloboard.com/univ/bbs/board.php?bo_table=all_bj_list&univ_name=%EB%8A%AA%EC%A7%80%EB%8C%80"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    print(f"[*] Accessing roster page...")
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        print(f"[!] Failed to fetch page. Status code: {response.status_code}")
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    rows = soup.find_all('tr')
    
    results = []
    
    for row in rows:
        # 1. Find name & tier from p_name class
        name_link = row.find('a', class_='p_name')
        if not name_link:
            continue
            
        name_with_tier = name_link.get_text(strip=True)
        # Regex to split Name and (Tier)
        match = re.search(r'([^(]+)\(([^)]+)\)', name_with_tier)
        if match:
            name = match.group(1).strip()
            tier = match.group(2).strip()
        else:
            name = name_with_tier
            tier = "Unknown"
            
        # 2. Extract Race from the second <td>
        tds = row.find_all('td')
        if len(tds) < 2:
            continue
            
        # The race is usually inside the second TD's text
        race_text = tds[1].get_text(separator=' ', strip=True)
        # Extract first word as Race (Zerg/Protoss/Terran)
        race = race_text.split()[0] if race_text else "Unknown"
        # Convert to P, Z, T
        race_code = race[0].upper() if race else "?"
        
        # 3. Extract Profile ID (wr_id) from '개인전적(새창)' link
        profile_link = row.find('a', string=re.compile('개인전적'))
        profile_id = "Not Found"
        if profile_link and 'wr_id=' in profile_link['href']:
            profile_id = re.search(r'wr_id=(\d+)', profile_link['href']).group(1)
            
        # Filter for targets
        if name in targets:
            results.append({
                "name": name,
                "tier": tier,
                "race": race_code,
                "wr_id": profile_id
            })
            
    return results

if __name__ == "__main__":
    target_members = ["정연이", "지아송", "아링"]
    results = extract_nzu_roster(target_members)
    
    print("\n" + "="*50)
    print(f"{'이름':<10} | {'티어':<5} | {'종족':<5} | {'전적ID (wr_id)':<15}")
    print("-" * 50)
    for res in results:
        print(f"{res['name']:<10} | {res['tier']:<7} | {res['race']:<7} | {res['wr_id']:<15}")
    print("="*50)
