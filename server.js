// Backend Server dla Asystenta Podatkowego AI z PRAWDZIWYM WEB SEARCH
// Uzywa Brave Search API + Claude Tools - VERSION 1.2 ULTRA

const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();

// CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));

app.use(express.json());

// KLUCZE API
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

// SYSTEM PROMPT - ULTRA MOCNA WERYFIKACJA
const SYSTEM_PROMPT = `Jestes asystentem AI biura rachunkowego LEX TAX J.Opala Sp. jawna (rachunkowe.com.pl). 

TWOJA ROLA: Edukujesz i kierujesz do kontaktu z biurem - NIE zastepujesz ksiegowego!

WAZNE ZASADY:
1. Udzielasz OGOLNYCH informacji edukacyjnych
2. ZAWSZE zaznaczasz ze to nie jest indywidualna porada
3. ZAWSZE zachecasz do kontaktu z biurem dla konkretnych spraw
4. NIE analizujesz dokumentow, umow, deklaracji
5. NIE dajesz konkretnych porad "zrob X", tylko "sprawdz z ksiegowym"

NARZEDZIE WEB_SEARCH:
Masz narzedzie web_search - UZYWAJ GO gdy klient pyta o:
- Aktualne limity (leasingu, amortyzacji, ZUS, VAT)
- Terminy dla konkretnego roku (PIT, CIT, VAT, JPK)
- Stawki podatkow/skladek na dany rok
- Nowe przepisy "od roku X" lub zmiany
- KSeF, JPK_V7, aktualne regulacje
- Konkretne kwoty i daty

ZASADY WYSZUKIWANIA - BARDZO WAZNE:
1. ZAWSZE uzywaj web_search dla aktualnych informacji!
2. Szukaj po polsku: "limity leasing 2026", "skladka zdrowotna 2026 weto", "skladka zdrowotna 2026 obowiazujace zasady"
3. KRYTYCZNIE OCENIAJ WYNIKI - TO NAJWAZNIEJSZE:
   - Sprawdz DATE artykulu - preferuj artykuly z ostatnich 30 dni
   - Jesli artykuly sa STARE (z kwietnia, maja, czerwca) - MUSISZ szukac dalej!
   - Szukaj slow kluczowych: "WETO", "ODRZUCONO", "NIE WESZLO", "ZMIANY W USTAWIE"
   - Dla przepisow 2026 - szukaj "2026 aktualne stan prawny" lub "2026 co obowiazuje"
4. NIGDY nie podawaj informacji z jednego starego artykulu!

WERYFIKACJA INFORMACJI - KRYTYCZNIE WAZNE:
Po wyszukaniu MUSISZ sprawdzic:

1. CZY TO OBOWIAZUJACE PRAWO CZY TYLKO PLANY/PROJEKTY:
   - "Sejm uchwalil" = to tylko plan, moze byc weto!
   - "Wchodzi w zycie" = sprawdz czy naprawde weszlo!
   - "Planowane zmiany" = to NIE jest obowiazujace prawo!

2. CZY NIE BYLO POZNIEJSZEGO WETA LUB ZMIANY:
   - Jesli artykul z kwietnia/maja/czerwca - MUSISZ szukac "weto", "odrzucono"
   - Szukaj nowszych artykulow z pazdziernika/listopada/grudnia
   - Jesli WETO - podaj ze ustawa NIE WESZLA W ZYCIE!

3. PRZYKLAD - SKLADKA ZDROWOTNA 2026:
   - Artykuly z kwietnia 2025 mowia o "nowych zasadach" - TO NIEAKTUALNE!
   - Prezydent ZAWETOWAŁ ustawe w pazdzierniku 2025
   - Skladka 2026 pozostaje BEZ ZMIAN (stare zasady)
   - ZAWSZE szukaj "skladka zdrowotna 2026 weto" lub "skladka zdrowotna 2026 aktualne"

4. JESLI WATPISZ:
   - Zaznacz "informacje wymagaja weryfikacji z biurem"
   - Podaj ze znalazles sprzeczne zrodla
   - Zachec do kontaktu: 501 408 269

PRZYKLAD DOBREJ ODPOWIEDZI:
"Szukam informacji o skladce zdrowotnej 2026...
[web_search: skladka zdrowotna 2026 weto]
[web_search: skladka zdrowotna 2026 aktualne zasady]

Na podstawie weryfikacji z kilku zrodel:
- Wczesniej planowano zmiany (artykuly z kwietnia 2025)
- JEDNAK prezydent zawetowal ustawe w pazdzierniku 2025
- W 2026 obowiazuja stare zasady: 9% dochodow, min. 9% minimalnego wynagrodzenia

Zrodla: [data, link]
Wazne: To ogolne informacje. Skontaktuj sie z biurem: 501 408 269"

PRZYKLAD ZLEJ ODPOWIEDZI:
"Na podstawie informacji z kwietnia 2025, w 2026 skladka zdrowotna bedzie..."
(nie sprawdzil czy ustawa weszla w zycie!)

INSTRUKCJA GENEROWANIA TOKENU KSEF:
1. Wejdz na: https://ksef.mf.gov.pl/web/login
2. Wpisz NIP firmy i "Uwierzytelnij"
3. Zaloguj przez Profil Zaufany / e-Dowod / podpis kwalifikowany
4. Zakladka "Tokeny" -> "Generuj token"
5. Nadaj nazwe (np. "Biuro rachunkowe")
6. Uprawnienia: wystawianie i odczyt e-faktur, okres: bezterminowo
7. "Generuj token" -> Skopiuj (pokazuje sie raz!)
8. Wyslij token do biura: biuro@rachunkowe.com.pl

OGRANICZENIA:
- "Czy moge odliczyc [konkretny wydatek]?" -> "To wymaga analizy dokumentow"
- "Sprawdz moja deklaracje/umowe" -> "Nie analizuje dokumentow"
- "Co w mojej sytuacji?" -> "Kazda sytuacja jest inna, potrzebujesz konsultacji"

SZABLON ZAKONCZENIA:
Wazne: To ogolne informacje edukacyjne zweryfikowane na dzien [data]. Kazda sytuacja wymaga indywidualnej analizy. 
Potrzebujesz konkretnej porady? Tel: 501 408 269, Email: biuro@rachunkowe.com.pl - Pomozemy Ci zoptymalizowac podatki i uniknac bledow!`;

// Brave Search
function braveSearch(query) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.search.brave.com',
            port: 443,
            path: `/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&country=pl`,
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-Subscription-Token': BRAVE_API_KEY
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`Brave API Error ${res.statusCode}`));
                }
                try {
                    const data = JSON.parse(body);
                    const results = data.web?.results || [];
                    
                    const formatted = results.slice(0, 5).map((r, i) => 
                        `[${i+1}] ${r.title}\n${r.description}\nZrodlo: ${r.url}`
                    ).join('\n\n');
                    
                    resolve(formatted || 'Brak wynikow wyszukiwania.');
                } catch (e) {
                    reject(new Error('Brave JSON Parse Error: ' + e.message));
                }
            });
        });

        req.on('error', (e) => reject(new Error('Brave Connection Error: ' + e.message)));
        req.end();
    });
}

// Claude API z Tools
function callClaudeWithTools(userMessage, conversationHistory = []) {
    return new Promise((resolve, reject) => {
        const messages = [
            ...conversationHistory,
            { role: 'user', content: userMessage }
        ];

        const requestData = {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            messages: messages,
            tools: [{
                name: 'web_search',
                description: 'Search the web for current information about Polish tax laws. CRITICAL: Always verify if information is current law or just plans/proposals.',
                input_schema: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query in Polish. For laws, ALWAYS add "weto", "obowiazujace", "aktualne" to verify status. Example: "skladka zdrowotna 2026 weto aktualne"'
                        }
                    },
                    required: ['query']
                }
            }]
        };

        makeClaudeRequest(requestData, resolve, reject, messages);
    });
}

// Wywolanie Claude API
function makeClaudeRequest(requestData, resolve, reject, conversationHistory) {
    const data = JSON.stringify(requestData);

    const options = {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'
        }
    };

    const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Claude API Error ${res.statusCode}: ${body}`));
            }

            try {
                const response = JSON.parse(body);
                
                if (response.stop_reason === 'tool_use') {
                    handleToolUse(response, conversationHistory, resolve, reject, requestData.tools);
                } else {
                    const textContent = response.content.find(c => c.type === 'text');
                    resolve(textContent ? textContent.text : 'Przepraszam, wystapil blad.');
                }
            } catch (e) {
                reject(new Error('Claude JSON Parse Error: ' + e.message));
            }
        });
    });

    req.on('error', (e) => reject(new Error('Claude Connection Error: ' + e.message)));
    req.write(data);
    req.end();
}

// Obsluga Tool Use
async function handleToolUse(response, conversationHistory, resolve, reject, tools) {
    const toolUse = response.content.find(c => c.type === 'tool_use');
    
    if (!toolUse || toolUse.name !== 'web_search') {
        return resolve('Przepraszam, wystapil problem z wyszukiwaniem.');
    }

    const searchQuery = toolUse.input.query;
    console.log('[Web Search]', searchQuery);

    try {
        const searchResults = await braveSearch(searchQuery);
        console.log('[Search Results]', searchResults.substring(0, 200) + '...');

        const updatedMessages = [
            ...conversationHistory,
            { role: 'assistant', content: response.content },
            {
                role: 'user',
                content: [{
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: searchResults
                }]
            }
        ];

        const nextRequest = {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            messages: updatedMessages,
            tools: tools
        };

        makeClaudeRequest(nextRequest, resolve, reject, updatedMessages);

    } catch (error) {
        console.error('[Search Error]', error.message);
        resolve('Przepraszam, wystapil problem z wyszukiwaniem aktualnych informacji. Zadzwon do nas: 501 408 269');
    }
}

// ENDPOINTY
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        service: 'LEX TAX Backend API',
        version: '1.2 ULTRA',
        endpoints: {
            health: '/api/health',
            chat: '/api/chat'
        }
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server dziala z ULTRA MOCNA weryfikacja!',
        features: {
            claude_ai: CLAUDE_API_KEY ? 'Enabled' : 'Missing',
            brave_search: BRAVE_API_KEY ? 'Enabled' : 'Missing',
            web_access: 'Active',
            verification: 'ULTRA - checks veto, outdated info'
        },
        timestamp: new Date().toISOString()
    });
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Brak wiadomosci' });
        }

        if (!CLAUDE_API_KEY) {
            return res.status(500).json({ 
                error: 'Brak klucza API'
            });
        }

        console.log('[Chat] Otrzymano:', message);
        
        const response = await callClaudeWithTools(message);
        
        console.log('[Response] Wyslano odpowiedz');
        
        res.json({ response });
        
    } catch (error) {
        console.error('[Error]', error.message);
        res.status(500).json({ 
            error: 'Blad serwera', 
            details: error.message 
        });
    }
});

// START
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('\nLEX TAX ASYSTENT AI v1.2 ULTRA');
    console.log('Port:', PORT);
    console.log('Claude:', CLAUDE_API_KEY ? '✅' : '❌');
    console.log('Brave:', BRAVE_API_KEY ? '✅' : '❌');
    console.log('Weryfikacja: ULTRA MOCNA\n');
});