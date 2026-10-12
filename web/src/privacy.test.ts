// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { parsePrivacy, privacyEnabled, workspaceVisible, savePrivacy } from './privacy';
beforeEach(()=>localStorage.clear());
it('enables only allowlisted public workspaces and panic hides every workspace',()=>{
 const policy=parsePrivacy({version:1,enabled:true,allowed:['public'],panic:false});
 expect(workspaceVisible(policy,'public')).toBe(true);expect(workspaceVisible(policy,'private')).toBe(false);
 expect(workspaceVisible({...policy,panic:true},'public')).toBe(false);
});
it('persists manual mode for other tabs without storing account or private data',()=>{
 savePrivacy(parsePrivacy({version:1,enabled:true,allowed:['public'],token:'secret',whispers:['secret']}));
 expect(privacyEnabled()).toBe(true);expect(localStorage.getItem('chatthing:v1:privacy')).not.toContain('secret');
});
it('bounds malformed allowlists and defaults unknown schemas to a hidden view',()=>{
 expect(parsePrivacy({version:99}).enabled).toBe(true);expect(parsePrivacy(null).enabled).toBe(false);
 expect(parsePrivacy({version:1,enabled:true,allowed:Array(100).fill('public')}).allowed).toEqual(['public']);
});
