const RSA_ALGO = { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
const AES_ALGO = { name: "AES-GCM", length: 256 };

export async function generateKeyPair() {
  return await window.crypto.subtle.generateKey(RSA_ALGO, true, ["encrypt", "decrypt"]);
}

export async function exportPublicKey(key: CryptoKey) {
  const exported = await window.crypto.subtle.exportKey("spki", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function exportPrivateKey(key: CryptoKey) {
  const exported = await window.crypto.subtle.exportKey("pkcs8", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function importPublicKey(pem: string) {
  const binaryDer = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  return await window.crypto.subtle.importKey("spki", binaryDer.buffer, RSA_ALGO, true, ["encrypt"]);
}

export async function importPrivateKey(pem: string) {
  const binaryDer = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  return await window.crypto.subtle.importKey("pkcs8", binaryDer.buffer, RSA_ALGO, true, ["decrypt"]);
}

export async function encryptMessage(text: string, senderPubKeyPem: string, receiverPubKeyPem: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  // 1. Generate AES Key
  const aesKey = await window.crypto.subtle.generateKey(AES_ALGO, true, ["encrypt", "decrypt"]);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // 2. Encrypt Message with AES
  const ciphertextBuffer = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, data);

  // 3. Export AES Key to encrypt it with RSA
  const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);

  // 4. Encrypt AES Key with Receiver's Public Key
  const receiverPubKey = await importPublicKey(receiverPubKeyPem);
  const encKeyReceiverBuffer = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, receiverPubKey, rawAesKey);

  // 5. Encrypt AES Key with Sender's Public Key
  const senderPubKey = await importPublicKey(senderPubKeyPem);
  const encKeySenderBuffer = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, senderPubKey, rawAesKey);

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer))),
    iv: btoa(String.fromCharCode(...new Uint8Array(iv))),
    encKeyReceiver: btoa(String.fromCharCode(...new Uint8Array(encKeyReceiverBuffer))),
    encKeySender: btoa(String.fromCharCode(...new Uint8Array(encKeySenderBuffer)))
  };
}

export async function decryptMessage(
  ciphertextB64: string,
  ivB64: string,
  encKeyB64: string,
  privateKeyPem: string
) {
  try {
    const privateKey = await importPrivateKey(privateKeyPem);
    const encKeyBuffer = Uint8Array.from(atob(encKeyB64), c => c.charCodeAt(0));

    // 1. Decrypt AES Key
    const rawAesKey = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encKeyBuffer);
    const aesKey = await window.crypto.subtle.importKey("raw", rawAesKey, AES_ALGO, false, ["decrypt"]);

    // 2. Decrypt Message
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));

    const decryptedBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (e) {
    console.error("Decryption failed", e);
    return "[رسالة مشفرة - تعذر فك التشفير]";
  }
}
