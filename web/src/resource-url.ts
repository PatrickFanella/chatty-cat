export function resourceURL(query: URLSearchParams): {
  tab: string | undefined;
  open: boolean | undefined;
  width: number | undefined;
  action: string | undefined;
} {
  const name = query.get('htab') ?? '',
    tab = (
      {
        config: 'help',
        help: 'help',
        media: 'htabRes',
        resources: 'htabRes',
        left: 'htabLib',
        liberatory: 'htabLib',
        libre: 'htabLbr',
        authors: 'htabAuth',
        stats: 'help',
      } as Record<string, string>
    )[name];
  const help = query.get('help'),
    width = Number(query.get('hpw'));
  return {
    tab,
    open:
      help === 'off' || help === '0' || help === 'labels'
        ? false
        : help === 'panel' || help === 'both' || help === '1' || help === ''
          ? true
          : tab
            ? true
            : undefined,
    width: Number.isInteger(width) && width >= 480 && width <= 1600 ? width : undefined,
    action: name === 'config' ? 'display-open' : name === 'stats' ? 'stats-open' : undefined,
  };
}
