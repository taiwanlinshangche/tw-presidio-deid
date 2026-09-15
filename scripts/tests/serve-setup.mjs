// UI-only fixture. Does not run installers or create runtime state.
import { resolve } from 'node:path';
import { createSetupServer } from '../setup/server.mjs';
const manager = { state: { status: 'missing', message: '第一次使用，需要下載並安裝必要元件。' }, install() {} };
const server = createSetupServer({ root: resolve(import.meta.dirname, '../..'), manager, instance: 'ui-test' });
server.listen(4187, '127.0.0.1');
