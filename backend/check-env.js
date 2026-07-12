const fs = require('fs');
const path = require('path');
console.log('cwd:', process.cwd());
console.log('__dirname:', __dirname);
console.log('exists .env in cwd:', fs.existsSync('.env'));
console.log('exists .env in dirname:', fs.existsSync(path.join(__dirname, '.env')));
console.log('process.env.DATABASE_URL:', process.env.DATABASE_URL || '<missing>');
console.log('process.env.PORT:', process.env.PORT || '<missing>');
