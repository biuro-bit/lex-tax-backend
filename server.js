const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Konfiguracja Claude API
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || 'your-api-key-here';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// System prompt dla asystenta podatkowego
const SYSTEM_PROMPT = `Jesteś ekspertem od polskiego prawa podatkowego, księgowości i ZUS. 

Twoje zadanie to udzielanie rzetelnych, praktycznych odpowiedzi na pytania związane z:
- Podatkami (VAT, PIT, CIT)
- Księgowością i rachunkowością
- ZUS i składkami społecznymi
- Terminami płatności i deklaracji
- Optymalizacją podatkową (IP BOX, Estonian CIT, ulgi)
- KSeF (Krajowy System e-Faktur)
- JPK (Jednolity Plik Kontrolny)

WAŻNE ZASADY:
1. Odpowiadaj TYLKO po polsku
2. Używaj konkretnych przykładów i liczb
3. Podawaj aktualne stawki i terminy (stan na 2025)
4. Cytuj podstawy prawne gdy to istotne
5. Ostrzegaj o terminach i karach
6. Zawsze kończ przypomnieniem: "To informacja ogólna. Dla porady dostosowanej do Twojej sytuacji skontaktuj się z LEX TAX: tel. 501 408 269, email: [email protected]"

Odpowiadaj zwięźle, konkretnie, profesjonalnie.`;

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Asystent Podatkowy AI Backend'
    });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Wiadomość nie może być pusta' });
        }

        console.log(`[${new Date().toISOString()}] Otrzymano pytanie: "${message.substring(0, 50)}..."`);

        // Sprawdź czy klucz API jest ustawiony
        if (!CLAUDE_API_KEY || CLAUDE_API_KEY === 'your-api-key-here') {
            console.log('[WARN] Brak klucza API - tryb testowy');
            return res.json({
                answer: '✅ Backend działa poprawnie!\n\n⚠️ Tryb testowy - brak klucza API Claude.\n\nAby włączyć prawdziwe AI:\n1. Uzyskaj klucz API z: https://console.anthropic.com/\n2. Ustaw zmienną: ANTHROPIC_API_KEY=twój-klucz\n3. Uruchom ponownie serwer\n\nDla porady podatkowej skontaktuj się z LEX TAX:\n📞 Tel: 501 408 269\n📧 Email: [email protected]'
            });
        }

        console.log('Wysyłam zapytanie do Claude API...');

        // Wywołaj Claude API
        const response = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2000,
                system: SYSTEM_PROMPT,
                messages: [
                    {
                        role: 'user',
                        content: message
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Claude API error:', response.status, errorData);
            
            if (response.status === 401) {
                return res.status(401).json({ 
                    error: 'Nieprawidłowy klucz API Claude. Sprawdź ANTHROPIC_API_KEY.' 
                });
            }
            
            return res.status(500).json({ 
                error: `Błąd API Claude: ${response.statusText}` 
            });
        }

        const data = await response.json();
        const answer = data.content[0].text;

        console.log(`[${new Date().toISOString()}] Odpowiedź wygenerowana (${answer.length} znaków)`);

        res.json({ answer });

    } catch (error) {
        console.error('[ERROR] Server error:', error.message);
        console.error(error.stack);
        res.status(500).json({ 
            error: 'Błąd serwera: ' + error.message 
        });
    }
});

// Start serwera
app.listen(PORT, () => {
    console.log(`\n🚀 Backend Asystenta Podatkowego AI uruchomiony!`);
    console.log(`📡 Serwer nasłuchuje na porcie: ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    console.log(`💬 Chat endpoint: http://localhost:${PORT}/api/chat`);
    
    if (!CLAUDE_API_KEY || CLAUDE_API_KEY === 'your-api-key-here') {
        console.log(`\n⚠️  UWAGA: Brak klucza API Claude!`);
        console.log(`   Ustaw zmienną: ANTHROPIC_API_KEY=twój-klucz`);
        console.log(`   lub: export ANTHROPIC_API_KEY=twój-klucz\n`);
    } else {
        console.log(`\n✅ Klucz API Claude skonfigurowany\n`);
    }
});
