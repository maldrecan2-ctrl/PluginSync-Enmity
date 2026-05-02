const X1 = "krd";
const X2 = "1978";

function safeBtoa(input) {
    if (typeof btoa !== 'undefined') return btoa(input);
    return Buffer.from(input, 'binary').toString('base64');
}

function safeAtob(input) {
    if (typeof atob !== 'undefined') return atob(input);
    return Buffer.from(input, 'base64').toString('binary');
}

function xorEncryptDecrypt(input) {
    const key = unescape(encodeURIComponent(X2));
    const data = unescape(encodeURIComponent(input));
    let binary = "";
    for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return safeBtoa(binary);
}

function xorDecrypt(base64) {
    try {
        const binary = safeAtob(base64);
        const key = unescape(encodeURIComponent(X2));
        let decodedBytes = "";
        for (let i = 0; i < binary.length; i++) {
            decodedBytes += String.fromCharCode(binary.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return decodeURIComponent(escape(decodedBytes));
    } catch(e) {
        return null;
    }
}

function toBase64Url(input) {
    return xorEncryptDecrypt(input)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function fromBase64Url(input) {
    const normalized = input
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const padLength = (4 - normalized.length % 4) % 4;
    const padded = normalized + "=".repeat(padLength);
    return xorDecrypt(padded);
}

function encryptMessage(content) {
    return `${X1}${toBase64Url(content)}`;
}

function decryptMessage(content) {
    let cleanContent = content;
    
    if (cleanContent.startsWith("||") && cleanContent.endsWith("||")) {
        cleanContent = cleanContent.slice(2, -2).trim();
    }
    
    if (!cleanContent.startsWith(X1)) return content;

    const body = cleanContent.slice(X1.length).trim();
    if (!body) return content;
    
    const decoded = fromBase64Url(body);
    return decoded !== null ? decoded : content;
}

const msg = "merhaba";
const encrypted = encryptMessage(msg);
console.log("Encrypted:", encrypted);
console.log("Decrypted:", decryptMessage(encrypted));

const vencordEncrypted = "krdDQUdFQwE"; // e.g.
