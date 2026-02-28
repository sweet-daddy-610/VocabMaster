/**
 * Dictionary Module
 * Handles word/phrase lookup via multiple APIs and translation
 * 
 * Multi-tier strategy:
 * 1. Single English words → Free Dictionary API → Wiktionary fallback
 * 2. English phrases → Wiktionary API → translation-only fallback
 * 3. Chinese input → MyMemory zh→en → then English lookup
 * 4. Final fallback → DeepSeek LLM (when all above fail)
 */

const DICTIONARY_API = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const WIKTIONARY_API = 'https://en.wiktionary.org/api/rest_v1/page/definition';
const TRANSLATION_API = 'https://api.mymemory.translated.net/get';

// ===== Input Detection =====

/**
 * Detect input type: 'chinese', 'phrase', or 'word'
 * @param {string} text
 * @returns {'chinese'|'phrase'|'word'}
 */
export function detectInputType(text) {
    const trimmed = text.trim();
    // Check for CJK characters (Chinese/Japanese/Korean)
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(trimmed)) {
        return 'chinese';
    }
    // Check for multiple words (phrase)
    if (/\s/.test(trimmed) && trimmed.split(/\s+/).length > 1) {
        return 'phrase';
    }
    return 'word';
}

// ===== Primary Lookup: Free Dictionary API =====

/**
 * Look up a single English word from the Free Dictionary API
 * @param {string} word
 * @returns {Promise<Object|null>} dictionary entry or null if not found
 */
async function lookupFreeDictionary(word) {
    try {
        const response = await fetch(`${DICTIONARY_API}/${encodeURIComponent(word.trim().toLowerCase())}`);
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`API error: ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) return null;

        const entry = data[0];
        return {
            word: entry.word,
            phonetic: extractPhonetic(entry),
            audioUrl: extractAudioUrl(entry),
            meanings: extractMeanings(entry),
            source: 'free-dictionary',
        };
    } catch (error) {
        console.error('Free Dictionary lookup error:', error);
        return null;
    }
}

// ===== Fallback Lookup: Wiktionary REST API =====

/**
 * Look up a word or phrase from Wiktionary REST API
 * @param {string} text - word or phrase
 * @returns {Promise<Object|null>} dictionary entry or null
 */
async function lookupWiktionary(text) {
    try {
        // Wiktionary uses underscores for spaces in URLs
        const slug = text.trim().toLowerCase().replace(/\s+/g, '_');
        const response = await fetch(`${WIKTIONARY_API}/${encodeURIComponent(slug)}`);
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`Wiktionary API error: ${response.status}`);
        }
        const data = await response.json();
        return parseWiktionaryResult(text, data);
    } catch (error) {
        console.error('Wiktionary lookup error:', error);
        return null;
    }
}

/**
 * Parse Wiktionary API response into our standard format
 */
function parseWiktionaryResult(originalText, data) {
    // Wiktionary returns { en: [...], fr: [...], ... } keyed by language
    const enEntries = data.en || data.English || [];
    if (!Array.isArray(enEntries) || enEntries.length === 0) {
        // Try any available language
        const firstLang = Object.keys(data).find(k => Array.isArray(data[k]) && data[k].length > 0);
        if (!firstLang) return null;
        return parseWiktionaryEntries(originalText, data[firstLang]);
    }
    return parseWiktionaryEntries(originalText, enEntries);
}

function parseWiktionaryEntries(originalText, entries) {
    const meanings = [];

    for (const entry of entries) {
        if (!entry.definitions || entry.definitions.length === 0) continue;

        const defs = entry.definitions.map((d) => {
            // Strip HTML tags from definition
            const definition = stripHtml(d.definition || '');
            const examples = (d.examples || []).slice(0, 3).map(e => stripHtml(e));
            return {
                definition,
                examples,
            };
        }).filter(d => d.definition);

        if (defs.length > 0) {
            meanings.push({
                partOfSpeech: entry.partOfSpeech || 'unknown',
                definitions: defs,
                synonyms: [],
            });
        }
    }

    if (meanings.length === 0) return null;

    return {
        word: originalText.trim().toLowerCase(),
        phonetic: '',
        audioUrl: null,
        meanings,
        source: 'wiktionary',
    };
}

/**
 * Strip HTML tags from a string
 */
function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').trim();
}

// ===== Translation =====

/**
 * Translate text between languages via MyMemory API
 * @param {string} text
 * @param {string} langPair - e.g. 'en|zh-CN' or 'zh-CN|en'
 * @returns {Promise<string>} translated text
 */
async function translateText(text, langPair) {
    try {
        const response = await fetch(
            `${TRANSLATION_API}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langPair)}`
        );
        if (!response.ok) throw new Error(`Translation API error: ${response.status}`);
        const data = await response.json();
        if (data.responseStatus === 200 && data.responseData) {
            const result = data.responseData.translatedText;
            // MyMemory returns the input text as-is if it can't translate
            if (result && result.toLowerCase() !== text.toLowerCase()) {
                return result;
            }
        }
        return null;
    } catch (error) {
        console.error('Translation error:', error);
        return null;
    }
}

/**
 * Translate English text to Chinese
 * @param {string} text
 * @returns {Promise<string>} Chinese translation
 */
export async function translateWord(text) {
    const result = await translateText(text, 'en|zh-CN');
    return result || '翻译暂不可用';
}

/**
 * Translate Chinese text to English
 * @param {string} text
 * @returns {Promise<string|null>} English translation or null
 */
async function translateChineseToEnglish(text) {
    return await translateText(text, 'zh-CN|en');
}

/**
 * Translate each definition in meanings to Chinese in parallel
 * Stores result in def.translationZh
 * @param {Array} meanings
 */
export async function translateDefinitions(meanings) {
    const tasks = [];
    for (const meaning of meanings) {
        for (const def of meaning.definitions) {
            tasks.push(
                translateText(def.definition, 'en|zh-CN').then((zh) => {
                    def.translationZh = zh || '';
                })
            );
        }
    }
    await Promise.all(tasks);
}

// ===== Unified Lookup Entry Point =====

/**
 * Look up a word, phrase, or Chinese expression
 * Returns dictionary data + translation in a unified format
 * 
 * @param {string} text - user input (English word, phrase, or Chinese)
 * @returns {Promise<{dictData: Object|null, translation: string, inputType: string}>}
 */
export async function lookupWord(text) {
    const inputType = detectInputType(text);
    const trimmed = text.trim();

    if (inputType === 'chinese') {
        return await handleChineseLookup(trimmed);
    } else if (inputType === 'phrase') {
        return await handlePhraseLookup(trimmed);
    } else {
        return await handleWordLookup(trimmed);
    }
}

/**
 * Handle single English word lookup
 */
async function handleWordLookup(word) {
    // Try Free Dictionary API first
    const [dictData, translation] = await Promise.all([
        lookupFreeDictionary(word),
        translateWord(word),
    ]);

    if (dictData) {
        await translateDefinitions(dictData.meanings);
        return { dictData, translation, inputType: 'word' };
    }

    // Fallback to Wiktionary
    const wikiData = await lookupWiktionary(word);
    if (wikiData) {
        await translateDefinitions(wikiData.meanings);
        return { dictData: wikiData, translation, inputType: 'word' };
    }

    // Translation-only fallback
    if (translation && translation !== '翻译暂不可用') {
        return {
            dictData: createTranslationOnlyResult(word),
            translation,
            inputType: 'word',
        };
    }

    // DeepSeek LLM fallback
    const deepSeekResult = await translateWithDeepSeek(word);
    if (deepSeekResult) {
        return {
            dictData: { ...createTranslationOnlyResult(word), source: 'deepseek' },
            translation: deepSeekResult,
            inputType: 'word',
        };
    }

    return { dictData: null, translation, inputType: 'word' };
}

/**
 * Handle English phrase lookup
 */
async function handlePhraseLookup(phrase) {
    // Try Wiktionary first (better for phrases)
    const [wikiData, translation] = await Promise.all([
        lookupWiktionary(phrase),
        translateWord(phrase),
    ]);

    if (wikiData) {
        await translateDefinitions(wikiData.meanings);
        return { dictData: wikiData, translation, inputType: 'phrase' };
    }

    // Also try Free Dictionary (some compound words work)
    const dictData = await lookupFreeDictionary(phrase);
    if (dictData) {
        await translateDefinitions(dictData.meanings);
        return { dictData, translation, inputType: 'phrase' };
    }

    // Translation-only fallback
    if (translation && translation !== '翻译暂不可用') {
        return {
            dictData: createTranslationOnlyResult(phrase),
            translation,
            inputType: 'phrase',
        };
    }

    // DeepSeek LLM fallback
    const deepSeekResult = await translateWithDeepSeek(phrase);
    if (deepSeekResult) {
        return {
            dictData: { ...createTranslationOnlyResult(phrase), source: 'deepseek' },
            translation: deepSeekResult,
            inputType: 'phrase',
        };
    }

    return { dictData: null, translation, inputType: 'phrase' };
}

/**
 * Handle Chinese input lookup
 */
async function handleChineseLookup(chineseText) {
    // Step 1: Translate Chinese → English
    let englishTranslation = await translateChineseToEnglish(chineseText);

    // DeepSeek fallback for Chinese→English translation
    if (!englishTranslation) {
        englishTranslation = await translateWithDeepSeek(chineseText);
    }

    if (!englishTranslation) {
        return {
            dictData: createTranslationOnlyResult(chineseText),
            translation: chineseText,
            inputType: 'chinese',
        };
    }

    // Step 2: Look up the English translation
    // Strip trailing punctuation that MyMemory often adds (e.g. "Hello." → "hello")
    const englishWord = englishTranslation.toLowerCase().trim().replace(/[.!?,;:]+$/, '');

    // Try Free Dictionary for the English result
    let dictData = await lookupFreeDictionary(englishWord);

    // Fallback to Wiktionary
    if (!dictData) {
        dictData = await lookupWiktionary(englishWord);
    }

    // Build result: show Chinese text as the main word, English as translation
    const result = dictData ? {
        ...dictData,
        word: chineseText,
        originalWord: dictData.word, // keep original English word
    } : createTranslationOnlyResult(chineseText);

    return {
        dictData: result,
        translation: englishTranslation,
        inputType: 'chinese',
    };
}

/**
 * Create a minimal result for translation-only display
 */
function createTranslationOnlyResult(text) {
    return {
        word: text.trim().toLowerCase(),
        phonetic: '',
        audioUrl: null,
        meanings: [],
        source: 'translation-only',
    };
}

// ===== LLM Translation (Multi-Provider) =====

const LLM_PROVIDERS = {
    deepseek: {
        name: 'DeepSeek',
        endpoint: 'https://api.deepseek.com/chat/completions',
        model: 'deepseek-chat',
    },
    gemini: {
        name: 'Google Gemini',
        getEndpoint: (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    },
};

const TRANSLATION_PROMPT = '你是一个专业翻译助手。识别用户输入的语种：如果是中文则翻译成英文，如果是英文或其他语言则翻译成中文。只返回翻译结果，不要任何解释、标点修改或额外内容。';

/**
 * Translate text using the user's selected LLM provider
 * @param {string} text
 * @returns {Promise<string|null>}
 */
export async function translateWithDeepSeek(text) {
    const provider = localStorage.getItem('llm-provider') || 'deepseek';
    const apiKey = localStorage.getItem('llm-api-key');
    if (!apiKey) return null;

    try {
        if (provider === 'gemini') {
            return await callGeminiApi(apiKey, TRANSLATION_PROMPT, text);
        } else {
            return await callOpenAICompatibleApi(LLM_PROVIDERS.deepseek.endpoint, apiKey, LLM_PROVIDERS.deepseek.model, TRANSLATION_PROMPT, text);
        }
    } catch (error) {
        console.error(`${provider} translation error:`, error);
        return null;
    }
}

/**
 * Test LLM API connectivity
 * @param {string} provider - 'deepseek' or 'gemini'
 * @param {string} apiKey
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function testDeepSeekApi(apiKey, provider = null) {
    provider = provider || localStorage.getItem('llm-provider') || 'deepseek';
    const providerName = LLM_PROVIDERS[provider]?.name || provider;

    try {
        let result;
        if (provider === 'gemini') {
            result = await callGeminiApi(apiKey, 'Reply with OK', 'Hello');
        } else {
            result = await callOpenAICompatibleApi(LLM_PROVIDERS.deepseek.endpoint, apiKey, LLM_PROVIDERS.deepseek.model, 'Reply with OK', 'Hello');
        }

        if (result) {
            return { success: true, message: `✅ 连接成功！${providerName} API 可用。` };
        } else {
            return { success: false, message: `❌ ${providerName} API 返回空结果。` };
        }
    } catch (error) {
        const msg = error.message || '';
        if (msg.includes('401') || msg.includes('403')) {
            return { success: false, message: `❌ API Key 无效，请检查后重试。` };
        }
        return { success: false, message: `❌ ${providerName} 连接失败: ${msg}` };
    }
}

/**
 * Call OpenAI-compatible API (DeepSeek, etc.)
 */
async function callOpenAICompatibleApi(endpoint, apiKey, model, systemPrompt, userMessage) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            temperature: 0.3,
            max_tokens: 200,
        }),
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
}

/**
 * Call Google Gemini API
 */
async function callGeminiApi(apiKey, systemPrompt, userMessage) {
    const endpoint = LLM_PROVIDERS.gemini.getEndpoint(apiKey);
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: {
                parts: [{ text: systemPrompt }],
            },
            contents: [{
                parts: [{ text: userMessage }],
            }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 200,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

// ===== Pronunciation =====

/**
 * Play pronunciation — 3-tier quality strategy:
 *   1. Real audio from Free Dictionary API (human recordings)
 *   2. Google Translate TTS (high-quality neural TTS)
 *   3. Web Speech API (browser built-in, last resort)
 * 
 * @param {string} word
 * @param {string} lang - language code, default 'en-US'
 * @param {string|null} audioUrl - optional audio URL from dictionary API
 */
export function playPronunciation(word, lang = 'en-US', audioUrl = null) {
    // Priority 1: Use real human audio from Free Dictionary API
    if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.play().catch((err) => {
            console.warn('Audio playback failed, falling back to Google TTS:', err);
            playWithGoogleTTS(word, lang);
        });
        return;
    }

    // Priority 2: Google Translate TTS
    playWithGoogleTTS(word, lang);
}

/**
 * Play pronunciation using Google Translate TTS (high quality)
 * Falls back to Web Speech API if Google TTS fails
 */
function playWithGoogleTTS(word, lang) {
    const ttsLang = lang === 'zh-CN' ? 'zh-CN' : 'en';
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${ttsLang}&client=tw-ob&q=${encodeURIComponent(word)}`;

    const audio = new Audio(url);
    audio.play().catch((err) => {
        console.warn('Google TTS failed, falling back to browser TTS:', err);
        playWithTTS(word, lang);
    });
}

/**
 * Play pronunciation using Web Speech API (last resort fallback)
 * Tries to select the highest quality voice available
 */
function playWithTTS(word, lang) {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.pitch = 1;

    // Try to pick a high-quality voice
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        const langPrefix = lang.split('-')[0]; // 'en' from 'en-US'
        // Prefer premium/enhanced voices, then any matching voice
        const preferred = voices.find(v =>
            v.lang.startsWith(langPrefix) &&
            (v.name.includes('Premium') || v.name.includes('Enhanced') || v.name.includes('Natural'))
        ) || voices.find(v =>
            v.lang.startsWith(langPrefix) && v.localService
        ) || voices.find(v =>
            v.lang.startsWith(langPrefix)
        );
        if (preferred) utterance.voice = preferred;
    }

    window.speechSynthesis.speak(utterance);
}

// ===== Word Extras: Conjugations, Synonyms, Antonyms =====

const CONJUGATIONS_PROMPT = `你是英语语法专家。分析输入的英语单词或短语，找出核心动词，给出该动词的完整时态变形。
仅返回如下JSON（不含任何其他内容或代码块标记）：
{"coreVerb":"<核心动词原形>","forms":{"base":"<原形>","pastTense":"<过去式>","pastParticiple":"<过去分词>","presentParticiple":"<现在分词>","thirdPerson":"<第三人称单数>"}}
若输入不含动词（如纯名词/形容词），返回：{"coreVerb":null,"forms":null}`;

const SYNONYMS_PROMPT = `你是英语词汇专家。给出输入英语单词或短语的3-5个近义词，每个附上简短中文解释。
仅返回如下JSON数组（不含任何其他内容或代码块标记）：
[{"word":"<近义词>","explanation":"<中文简释>"}]`;

const ANTONYMS_PROMPT = `你是英语词汇专家。给出输入英语单词或短语的3-5个反义词，每个附上简短中文解释。
仅返回如下JSON数组（不含任何其他内容或代码块标记）：
[{"word":"<反义词>","explanation":"<中文简释>"}]
若无明显反义词则返回空数组[]。`;

/**
 * Fetch word extras (conjugations / synonyms / antonyms) via the configured LLM
 * @param {string} word
 * @param {'conjugations'|'synonyms'|'antonyms'} type
 * @returns {Promise<Object|Array|null>}
 */
export async function fetchWordExtras(word, type) {
    const provider = localStorage.getItem('llm-provider') || 'deepseek';
    const apiKey = localStorage.getItem('llm-api-key');
    if (!apiKey) return null;

    const prompts = {
        conjugations: CONJUGATIONS_PROMPT,
        synonyms: SYNONYMS_PROMPT,
        antonyms: ANTONYMS_PROMPT,
    };
    const prompt = prompts[type];
    if (!prompt) return null;

    try {
        let raw;
        if (provider === 'gemini') {
            raw = await callGeminiApi(apiKey, prompt, word);
        } else {
            raw = await callOpenAICompatibleApi(
                LLM_PROVIDERS.deepseek.endpoint, apiKey,
                LLM_PROVIDERS.deepseek.model, prompt, word
            );
        }
        if (!raw) return null;

        // Strip potential markdown code fences
        const jsonStr = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error(`fetchWordExtras(${type}) error:`, error);
        return null;
    }
}

// ===== Internal helpers =====

function extractPhonetic(entry) {
    if (entry.phonetic) return entry.phonetic;
    if (entry.phonetics && entry.phonetics.length > 0) {
        for (const p of entry.phonetics) {
            if (p.text) return p.text;
        }
    }
    return '';
}

function extractAudioUrl(entry) {
    if (entry.phonetics && entry.phonetics.length > 0) {
        for (const p of entry.phonetics) {
            if (p.audio && p.audio.length > 0) return p.audio;
        }
    }
    return null;
}

function extractMeanings(entry) {
    if (!entry.meanings) return [];
    return entry.meanings.map((m) => ({
        partOfSpeech: m.partOfSpeech || 'unknown',
        definitions: (m.definitions || []).map((d) => ({
            definition: d.definition,
            examples: d.example ? [d.example] : [],
        })),
        synonyms: (m.synonyms || []).slice(0, 5),
    }));
}
