import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { confirmSignup, preflight, submit, unsubscribe } from './waitlist';

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: '/waitlist', method: 'POST', handler: submit });
http.route({ path: '/waitlist', method: 'OPTIONS', handler: preflight });
http.route({ path: '/waitlist/leave', method: 'POST', handler: unsubscribe });
http.route({ path: '/waitlist/leave', method: 'OPTIONS', handler: preflight });
http.route({ path: '/waitlist/confirm', method: 'POST', handler: confirmSignup });
http.route({ path: '/waitlist/confirm', method: 'OPTIONS', handler: preflight });
export default http;
