import { describe, expect, it } from 'vitest';
import { matchPath, resolveRoute } from '../src/app/match.ts';

describe('matchPath', () => {
  it('matches static and parameterised paths', () => {
    expect(matchPath('/', '/')).toEqual({});
    expect(matchPath('/projects', '/projects/')).toEqual({});
    expect(matchPath('/projects/:id', '/projects/moriium.main')).toEqual({ id: 'moriium.main' });
    expect(matchPath('/projects/:id', '/projects/a%20b')).toEqual({ id: 'a b' });
  });

  it('rejects other paths and broken escapes', () => {
    expect(matchPath('/projects/:id', '/projects')).toBeNull();
    expect(matchPath('/projects/:id', '/projects/a/b')).toBeNull();
    expect(matchPath('/projects/:id', '/projects/%E0%A4%A')).toBeNull();
    expect(matchPath('/agents', '/projects')).toBeNull();
  });

  it('resolves the first matching route', () => {
    const routes = [
      { name: 'projects', pattern: '/projects' },
      { name: 'project', pattern: '/projects/:id' },
    ] as const;
    expect(resolveRoute(routes, '/projects/x')?.route.name).toBe('project');
    expect(resolveRoute(routes, '/nope')).toBeNull();
  });
});
