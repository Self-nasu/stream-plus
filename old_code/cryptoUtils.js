const crypto = require('crypto');
require('dotenv').config({ path: "../.env" });

// Encrypt function
function encryptFilePath(filePath) {
    const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
    let encrypted = cipher.update(filePath, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

function decryptFilePath(encryptedPath) {
    const decipher = crypto.createDecipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedPath, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}


module.exports = {
    encryptFilePath,
    decryptFilePath
};
