import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { preflight, submit } from './waitlist';

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: '/waitlist', method: 'POST', handler: submit });
http.route({ path: '/waitlist', method: 'OPTIONS', handler: preflight });
export default http;
