"use strict";
/**
 *  This is a browser polyfill stub which replaces the Node DNS module.
 *  DNS does not have a standard browser polyfill. Users who want to bundle
 *  devp2p for the browser can alias the `dns` module to @ethereumjs/devp2p/browser/dns
 *  and inject this stub. EIP-1459 DNS discovery is disabled by default and
 *  can be explicitly disabled by setting DPTOption `shouldGetDnsPeers` to `false`
 */
Object.defineProperty(exports, "__esModule", { value: true });
const errorMessage = 'EIP-1459 DNS Discovery is not supported for browser environments ' +
    "because a standard polyfill for the native Node DNS module doesn't exist." +
    'You can disable EIP-1459 DNS discovery in devp2p by setting the "shouldGetDnsPeers" ' +
    'option to "false" in the DPTOptions object. ';
class dns {
    static setServers(_servers) {
        throw new Error(errorMessage);
    }
}
exports.default = dns;
dns.promises = {
    resolve: async function (_url, _recordType) {
        throw new Error(errorMessage);
    },
};
//# sourceMappingURL=dns.js.map