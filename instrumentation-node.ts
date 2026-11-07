import { getDbForRequest } from './lib/assets/store'
import { ensureImageQueueWorker } from './lib/generation/image-queue'

// Start once with the server so durable queued images continue after a deploy restart.
ensureImageQueueWorker(getDbForRequest())
