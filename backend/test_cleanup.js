
const { autoEndSessions } = require('./utils/sessionHelper');
require('dotenv').config();

async function test() {
    console.log('--- Testing autoEndSessions ---');
    const count = await autoEndSessions();
    console.log(`Finished. Total updated: ${count}`);
    process.exit(0);
}
test();
