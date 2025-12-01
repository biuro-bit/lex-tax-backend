// Backend Server dla Asystenta Podatkowego AI z PRAWDZIWYM WEB SEARCH
// Uzywa Brave Search API + Claude Tools

const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();

// ========================================
// CORS - POPRAWIONY dla Netlify
// ========================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));

app.use(express.json());

// ========================================
// KLUCZE API
// ========================================
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || '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';
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || 'BSARImdZcZ5Zwt8HQd0W0OX2ckLNC--';

// ========================================
// SYSTEM PROMPT - ZAKTUALIZOWANY
// ========================================

const SYSTEM_PROMPT = `Jestes asystentem AI biura rachunkowego LEX TAX J.Opala Sp. jawna (rachunkowe.com.pl). 

TWOJA ROLA: Edukujesz i kierujesz do kontaktu z biurem - NIE zastepujesz ksiegowego!

WAZNE ZASADY:
1. Udzielasz OGOLNYCH informacji edukacyjnych
2. ZAWSZE zaznaczasz ze to nie jest indywidualna porada
3. ZAWSZE zachecasz do kontaktu z biurem dla konkretnych spraw
4. NIE analizujesz dokumentow, umow, deklaracji
5. NIE dajesz konkretnych porad "zrob X", tylko "sprawdz z ksiegowym"

DOSTEP DO INTERNETU:
Masz dostep do narzedzia web_search - UZYWAJ GO gdy klient pyta o:
- Aktualne limity (leasingu, amortyzacji, ZUS, VAT)
- Terminy dla konkretnego roku (PIT, CIT, VAT, JPK)
- Stawki podatkow/skladek na dany rok
- Nowe przepisy "od roku X" lub zmiany
- KSeF, JPK_V7, aktualne regulacje
- Konkretne kwoty i daty

ZASADY WYSZUKIWANIA:
1. ZAWSZE uzywaj web_search dla aktualnych informacji!
2. Szukaj po polsku: "limity leasing 2026", "termin pit 2026", "skladka zdrowotna 2026 aktualne zasady"
3. KRYTYCZNIE OCENIAJ WYNIKI:
   - Sprawdz DATE artykulu - preferuj artykuly z ostatnich 30 dni
   - Szukaj informacji o ZMIANACH, WETO, ODROCZENIU przepisow
   - Jesli artykuly sa stare (3+ miesiace) - zaznacz ze informacje moga byc nieaktualne
4. Dla przepisow 2026 - szukaj "2026 aktualne" lub "2026 obowiazujace"

WERYFIKACJA INFORMACJI - BARDZO WAZNE:
Po wyszukaniu ZAWSZE sprawdz:
1. Czy znalezione informacje dotycza OBOWIAZUJACYCH przepisow czy tylko PLANOW
2. Czy nie bylo pozniejszego WETA, ZMIANY lub ODROCZENIA
3. Czy artykuly sa zgodne ze soba - jesli NIE, poszukaj nowszych zrodel
4. W razie watpliwosci - zaznacz ze "informacje wymagaja weryfikacji z biurem"

PRZYKLAD DOBREJ ODPOWIEDZI:
"Na podstawie najnowszych informacji z [data], KSeF bedzie obowiazkowy od 1 lutego 2026 dla duzych firm. 
Wazne: To ogolne informacje. Dla Twojej konkretnej sytuacji skontaktuj sie z biurem: 501 408 269"

PRZYKLAD ZLEJ ODPOWIEDZI:
"Skladka zdrowotna od 2026 bedzie..." (bez sprawdzenia czy ustawa weszla w zycie!)

Po wyszukaniu:
1. Przeanalizuj wyniki dokladnie
2. SPRAWDZ czy to obowiazujace prawo czy tylko projekty
3. Podaj informacje z zaznaczeniem daty zrodla
4. Cytuj zrodla jesli to wazne
5. Dodaj disclaimer
6. Zachec do kontaktu dla szczegolow

INSTRUKCJA GENEROWANIA TOKENU KSEF:
1. Wejdz na: https://ksef.mf.gov.pl/web/login
2. Wpisz NIP firmy i "Uwierzytelnij"
3. Zaloguj przez Profil Zaufany / e-Dowod / podpis kwalifikowany
4. Zakladka "Tokeny" -> "Generuj token"
5. Nadaj nazwe (np. "Biuro rachunkowe")
6. Uprawnienia: wystawianie i odczyt e-faktur, okres: bezterminowo
7. "Generuj token" -> Skopiuj (pokazuje sie raz!)
8. Wyslij token do biura: [email protected]

OGRANICZENIA:
- "Czy moge odliczyc [konkretny wydatek]?" -> "To wymaga analizy dokumentow"
- "Sprawdz moja deklaracje/umowe" -> "Nie analizuje dokumentow"
- "Co w mojej sytuacji?" -> "Kazda sytuacja jest inna, potrzebujesz konsultacji"

SZABLON ZAKONCZENIA:
Wazne: To ogolne informacje edukacyjne na podstawie [data zrodla]. Kazda sytuacja wymaga indywidualnej analizy. 
Potrzebujesz konkretnej porady? Tel: 501 408 269, Email: [email protected] - Pomozemy Ci zoptymalizowac podatki i uniknac bledow!`;

// ========================================
// FUNKCJA: Brave Search
// ========================================

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

// ========================================
// FUNKCJA: Claude API z Tools
// ========================================

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
                description: 'Search the web for current information about Polish tax laws, limits, deadlines, rates. Use this for any question about current regulations.',
                input_schema: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query in Polish (e.g. "limity leasing 2026", "termin pit 2026", "skladka zdrowotna 2026 aktualne zasady")'
                        }
                    },
                    required: ['query']
                }
            }]
        };

        makeClaudeRequest(requestData, resolve, reject, messages);
    });
}

// ========================================
// FUNKCJA: Wywolanie Claude API
// ========================================

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

// ========================================
// FUNKCJA: Obsluga Tool Use
// ========================================

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

// ========================================
// ENDPOINTY
// ========================================

// Root endpoint - Railway/Render health check
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        service: 'LEX TAX Backend API',
        version: '1.1',
        endpoints: {
            health: '/api/health',
            chat: '/api/chat'
        }
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server dziala z pelnym dostepem do internetu!',
        features: {
            claude_ai: CLAUDE_API_KEY ? 'Enabled' : 'Missing API Key',
            brave_search: BRAVE_API_KEY ? 'Enabled' : 'Missing API Key',
            web_access: 'Active',
            verification: 'Enhanced - checks for outdated info'
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
                error: 'Brak klucza API',
                message: 'Skontaktuj sie z administratorem'
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

// ========================================
// START SERWERA
// ========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('\nASYSTENT PODATKOWY AI + INTERNET - LEX TAX v1.1');
    console.log('Server dziala na http://localhost:' + PORT);
    console.log('Claude API:', CLAUDE_API_KEY ? 'Skonfigurowany' : 'BRAK KLUCZA');
    console.log('Brave Search:', BRAVE_API_KEY ? 'Skonfigurowany' : 'BRAK KLUCZA');
    console.log('Dostep do internetu: AKTYWNY');
    console.log('Weryfikacja informacji: ULEPSZONA');
    console.log('CORS: Wszystkie domeny');
    console.log('Dostepne endpointy:');
    console.log('  GET  / - API Info');
    console.log('  GET  /api/health - Test serwera');
    console.log('  POST /api/chat - Rozmowa z AI\n');
});
