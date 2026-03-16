const axios = require('axios');
const fs = require('fs');

async function findChatbot() {
    try {
        const res = await axios.get('https://ssustar.iwinv.net/1vs1.php');
        const lines = res.data.split('\n');
        lines.forEach((line, i) => {
            if (line.includes('chatbot.php')) {
                console.log(`Line ${i}: ${line.trim()}`);
            }
        });

        // Also check if there are linked JS files
        const scriptRegex = /src="([^"]+\.js)"/g;
        let match;
        while ((match = scriptRegex.exec(res.data)) !== null) {
            console.log(`Script found: ${match[1]}`);
        }
    } catch (e) {
        console.error(e.message);
    }
}
findChatbot();
