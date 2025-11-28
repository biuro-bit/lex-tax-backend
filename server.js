// Backend Server dla Asystenta Podatkowego AI z PRAWDZIWYM WEB SEARCH
// Używa Brave Search API + Claude Tools

const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

// ========================================
// KLUCZE API
// ========================================
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || '';

// ========================================
// SYSTEM PROMPT
// ========================================

const SYSTEM_PROMPT = `Jesteś asystentem AI biura rachunkowego LEX TAX J.Opala Sp. jawna (rachunkowe.com.pl).

TWOJA ROLA: Edukujesz i kierujesz do kontaktu z biurem - NIE zastępujesz księgowego!

WAŻNE ZASADY:
1. Udzielasz OGÓLNYCH informacji edukacyjnych
2. ZAWSZE zaznaczasz że to nie jest indywidualna porada
3. ZAWSZE zachęcasz do kontaktu z biurem dla konkretnych spraw
4. NIE analizujesz dokumentów, umów, deklaracji
5. NIE dajesz konkretnych porad "zrób X", tylko "sprawdź z księgowym"

DOSTĘP DO INTERNETU:
Masz dostęp do narzędzia web_search - UŻYWAJ GO gdy klient pyta o:
- Aktualne limity (leasingu, amortyzacji, ZUS, VAT)
- Terminy dla konkretnego roku (PIT, CIT, VAT, JPK)
- Stawki podatków/składek na dany rok
- Nowe przepisy "od roku X" lub zmiany
- KSeF, JPK_V7, aktualne regulacje
- Konkretne kwoty i daty

ZAWSZE używaj web_search dla aktualnych informacji!
Szukaj po polsku: "limity leasing 2026", "termin pit 2026", etc.

Po wyszukaniu:
1. Przeanalizuj wyniki dokładnie
2. Podaj informacje na podstawie znalezionych źródeł
3. Cytuj źródła jeśli to ważne
4. Dodaj disclaimer
5. Zachęć do kontaktu dla szczegółów

INSTRUKCJA GENEROWANIA TOKENU KSEF:
1. Wejdź na: https://ksef.mf.gov.pl/web/login
2. Wpisz NIP firmy i "Uwierzytelnij"
3. Zaloguj przez Profil Zaufany / e-Dowód / podpis kwalifikowany
4. Zakładka "Tokeny" → "Generuj token"
5. Nadaj nazwę (np. "Biuro rachunkowe")
6. Uprawnienia: wystawianie i odczyt e-faktur, okres: bezterminowo
7. "Generuj token" → Skopiuj (pokazuje się raz!)
8. Wyślij token do biura: [email protected]

OGRANICZENIA:
- "Czy mogę odliczyć [konkretny wydatek]?" → "To wymaga analizy dokumentów"
- "Sprawdź moją deklarację/umowę" → "Nie analizuję dokumentów"
- "Co w mojej sytuacji?" → "Każda sytuacja jest inna, potrzebujesz konsultacji"

SZABLON ZAKOŃCZENIA:
⚠️ Ważne: To ogólne informacje edukacyjne. Każda sytuacja wymaga indywidualnej analizy.

📞 Potrzebujesz konkretnej porady?
   Tel: 501 408 269
   Email: [email protected]

💼 Pomożemy Ci zoptymalizować podatki i uniknąć błędów!`;

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
                    
                    // Format wyników dla Claude
                    const formatted = results.slice(0, 5).map((r, i) => 
                        `[${i+1}] ${r.title}\n${r.description}\nŹródło: ${r.url}`
                    ).join('\n\n');
                    
                    resolve(formatted || 'Brak wyników wyszukiwania.');
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
                            description: 'Search query in Polish (e.g. "limity leasing 2026", "termin pit 2026")'
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
// FUNKCJA: Wywołanie Claude API
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
                
                // Sprawdź czy Claude chce użyć narzędzia
                if (response.stop_reason === 'tool_use') {
                    handleToolUse(response, conversationHistory, resolve, reject, requestData.tools);
                } else {
                    // Normalna odpowiedź tekstowa
                    const textContent = response.content.find(c => c.type === 'text');
                    resolve(textContent ? textContent.text : 'Przepraszam, wystąpił błąd.');
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
// FUNKCJA: Obsługa Tool Use
// ========================================

async function handleToolUse(response, conversationHistory, resolve, reject, tools) {
    const toolUse = response.content.find(c => c.type === 'tool_use');
    
    if (!toolUse || toolUse.name !== 'web_search') {
        return resolve('Przepraszam, wystąpił problem z wyszukiwaniem.');
    }

    const searchQuery = toolUse.input.query;
    console.log('[🔍 Web Search]', searchQuery);

    try {
        // Wywołaj Brave Search
        const searchResults = await braveSearch(searchQuery);
        console.log('[✅ Search Results]', searchResults.substring(0, 200) + '...');

        // Kontynuuj rozmowę z wynikami
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
        console.error('[❌ Search Error]', error.message);
        resolve('Przepraszam, wystąpił problem z wyszukiwaniem aktualnych informacji. Zadzwoń do nas: 501 408 269');
    }
}

// ========================================
// ENDPOINTY
// ========================================

// Endpoint zdrowia
// Root endpoint dla Railway healthcheck
app.get('/', (req, res) => {
    res.json({ 
        status: 'OK',
        message: 'LEX TAX Backend API',
        endpoints: {
            health: '/api/health',
            chat: '/api/chat'
        }
    });
});

// Endpoint zdrowia
app.get('/api/health', (req, res) => {
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server działa z pełnym dostępem do internetu!',
        features: {
            claude_ai: '✅ Enabled',
            brave_search: '✅ Enabled',
            web_access: '✅ Active'
        },
        timestamp: new Date().toISOString()
    });
});

// Endpoint czatu
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Brak wiadomości' });
        }

        console.log('\n[💬 Chat] Otrzymano:', message);
        
        const response = await callClaudeWithTools(message);
        
        console.log('[✅ Response] Wysłano odpowiedź\n');
        
        res.json({ response });
        
    } catch (error) {
        console.error('[❌ Error]', error.message);
        res.status(500).json({ 
            error: 'Błąd serwera', 
            details: error.message 
        });
    }
});

// ========================================
// START SERWERA
// ========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ================================================================');
    console.log('   ASYSTENT PODATKOWY AI + INTERNET - LEX TAX');
    console.log('================================================================');
    console.log(`✅ Server działa na http://localhost:${PORT}`);
    console.log('🔑 Claude API: Skonfigurowany ✅');
    console.log('🔍 Brave Search: Skonfigurowany ✅');
    console.log('🌐 Dostęp do internetu: AKTYWNY ✅');
    console.log('================================================================');
    console.log('📡 Dostępne endpointy:');
    console.log('   GET  /api/health - Test serwera');
    console.log('   POST /api/chat   - Rozmowa z AI (z dostępem do internetu)');
    console.log('================================================================');
    console.log('💡 Otwórz asystent-FIXED.html w przeglądarce');
    console.log('🎯 AI będzie automatycznie szukać w internecie gdy potrzeba!');
    console.log('================================================================\n');
});