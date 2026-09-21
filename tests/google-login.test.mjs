import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleLogin} from '../js/google-login.js';

function setup(exchangeCredential=async token=>({uid:'test-user',token}),timeoutMs=1000){
  let config, request;
  const login=createGoogleLogin({clientId:'test-client',oauth2:{initTokenClient(options){config=options;return {requestAccessToken(options){request=options;}};}},exchangeCredential,timeoutMs});
  return {login,get config(){return config;},get request(){return request;}};
}
test('direct sign-in synchronously opens account picker and exchanges credential',async()=>{
 const flow=setup();const promise=flow.login();assert.deepEqual(flow.request,{prompt:'select_account'});
 assert.equal(flow.config.scope,'openid email profile');assert.equal(flow.config.include_granted_scopes,false);
 await flow.config.callback({access_token:'test-token'});assert.deepEqual(await promise,{uid:'test-user',token:'test-token'});
});
test('popup closed and blocked errors allow retry',async()=>{
 const flow=setup();for(const [type,code] of [['popup_closed','auth/popup-closed-by-user'],['popup_failed_to_open','auth/popup-blocked']]){
 const promise=flow.login();flow.config.error_callback({type});await assert.rejects(promise,{code});}
});
test('denied or missing credentials never call Firebase',async()=>{
 let count=0;const flow=setup(async()=>count++);
 for(const response of [{error:'access_denied'},{}]){const promise=flow.login();await flow.config.callback(response);await assert.rejects(promise,{code:'auth/google-denied'});}
 assert.equal(count,0);
});
test('Firebase exchange errors are propagated',async()=>{
 const flow=setup(async()=>{throw Object.assign(new Error('Denied'),{code:'auth/invalid-credential'});});
 const promise=flow.login();await flow.config.callback({access_token:'test-token'});await assert.rejects(promise,{code:'auth/invalid-credential'});
});
test('duplicate click cannot overwrite pending sign-in',async()=>{
 const flow=setup();const first=flow.login();await assert.rejects(flow.login(),{code:'auth/sign-in-pending'});
 await flow.config.callback({access_token:'test-token'});assert.equal((await first).uid,'test-user');
});
test('stalled sign-in times out',async()=>{
 const flow=setup(undefined,10);await assert.rejects(flow.login(),{code:'auth/timeout'});
});

test('late callbacks from a timed-out popup cannot settle a new attempt',async()=>{
 const flow=setup(undefined,10);const first=flow.login();const old=flow.config;
 await assert.rejects(first,{code:'auth/timeout'});
 const second=flow.login();old.error_callback({type:'popup_closed'});
 await old.callback({access_token:'stale-token'});
 await flow.config.callback({access_token:'fresh-token'});
 assert.equal((await second).token,'fresh-token');
});
