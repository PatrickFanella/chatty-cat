import type {WorkspaceSnapshot} from './workspaces';
import {parseWorkspaceChannels} from './protocol';
import {reconcileSplits} from './splits';
export function watchedWorkspace(destination:WorkspaceSnapshot,channel:string,limit:number):WorkspaceSnapshot{
 if(!/^[a-z0-9_]{1,25}$/.test(channel))throw new Error('Invalid watched channel');
 const channels=parseWorkspaceChannels([...new Set([...destination.channels,channel])].join(','),limit);
 const old=destination.settings.extras.splits;const layout=old?reconcileSplits(old,channels,destination.channels):undefined;
 if(old&&!layout)throw new Error('Close a pane or tab before adding this watched channel');
 return {...destination,channels,target:channel,settings:{...destination.settings,extras:{...destination.settings.extras,...(layout?{splits:layout}:{})}}};
}
