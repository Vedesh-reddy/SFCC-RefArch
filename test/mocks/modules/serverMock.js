// Recording stand-in for the `server` module. Controllers register routes by
// calling `server.get`/`server.post`; this mock captures each registration's
// HTTP method and middleware chain so a test can assert how a route is wired
// without booting the real routing stack (which pulls in the `dw/*` platform).
function create() {
    var registrations = {};

    function record(method) {
        return function register() {
            var args = Array.prototype.slice.call(arguments);
            registrations[args[0]] = {
                method: method,
                chain: args.slice(1)
            };
        };
    }

    return {
        registrations: registrations,
        get: record('get'),
        post: record('post'),
        use: record('use'),
        exports: function () { return {}; },
        forms: { getForm: function () { return {}; } },
        middleware: { include: function () {} }
    };
}

module.exports = { create: create };
