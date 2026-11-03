# Read i915 PMU engine busy time (ns) over a window. Usage: pmu.py seconds event...
import ctypes, os, struct, sys, time
libc = ctypes.CDLL(None, use_errno=True)
base = '/sys/bus/event_source/devices/i915'
ptype = int(open(base + '/type').read())
cpu = int(open(base + '/cpumask').read().split(',')[0].split('-')[0])
def config(ev):
    return int(open(f'{base}/events/{ev}').read().strip().split('=')[1], 16)
def open_ev(ev):
    attr = bytearray(128)
    struct.pack_into('IIQ', attr, 0, ptype, 128, config(ev))
    buf = ctypes.create_string_buffer(bytes(attr), 128)
    fd = libc.syscall(298, buf, -1, cpu, -1, 0)
    if fd < 0: raise OSError(ctypes.get_errno(), 'perf_event_open ' + ev)
    return fd
def rd(fd): return struct.unpack('Q', os.read(fd, 8))[0]
secs = float(sys.argv[1]); evs = sys.argv[2:]
fds = [open_ev(e) for e in evs]
a = [rd(f) for f in fds]; t0 = time.monotonic()
time.sleep(secs)
b = [rd(f) for f in fds]; t1 = time.monotonic()
print(' '.join(f'{e}={y-x}' for e, x, y in zip(evs, a, b)), f'wall_ns={int((t1-t0)*1e9)}')
