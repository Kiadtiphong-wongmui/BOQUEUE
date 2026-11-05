import { config } from './config.ts';
import { createPool } from './db/pool.ts';
import { createRepository } from './db/repository.ts';
import { createApp } from './server.ts';

const pool = createPool();
const app = createApp(createRepository(pool), config.corsOrigin);

app.listen(config.port, () => console.log(`Server listening on port ${config.port}`));
