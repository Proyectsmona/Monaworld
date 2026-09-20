import { describe, expect, it } from 'vitest';
import { normalizeCommand, eventIsMonetary } from './index.js';
describe('MonaWorld domain',()=>{
  it('normaliza comandos',()=>{expect(normalizeCommand(' Fuego ')).toBe('!fuego');expect(normalizeCommand('!RISA')).toBe('!risa')});
  it('detecta eventos monetarios',()=>{expect(eventIsMonetary('super_chat')).toBe(true);expect(eventIsMonetary('chat_message')).toBe(false)});
});
