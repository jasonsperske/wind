// Which worlds there are to fly, and which one you asked for.
//
// world/maps.json is the list. It exists so the title screen can name the maps
// without fetching and baking all of them, and so adding a world is a file plus
// a line rather than a code change.

import { MAP_LIST } from './config.js';

const FALLBACK = {
  default: 'three-lands',
  maps: [{ id: 'three-lands', name: 'The three lands', file: 'world.svg' }],
};

export async function loadMapList() {
  try {
    const res = await fetch(MAP_LIST, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const data = await res.json();
    const maps = (data.maps || []).filter((m) => m && m.id && m.file);
    if (!maps.length) throw new Error('no maps listed');
    return { default: data.default || maps[0].id, maps };
  } catch (err) {
    return Object.assign({}, FALLBACK, {
      error: 'The map list <code>' + MAP_LIST + '</code> could not be read ('
        + err.message + '), so only the default world is offered.',
    });
  }
}

export function pickMap(list, wanted) {
  return list.maps.find((m) => m.id === wanted)
      || list.maps.find((m) => m.id === list.default)
      || list.maps[0];
}

export function mapUrl(entry) {
  return MAP_LIST.replace(/[^/]*$/, '') + entry.file;
}
