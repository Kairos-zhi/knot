"""Prepare a pinned proposal; explicitly export it offline after digest review."""
import argparse
import csv
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from uuid import uuid4

sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from mvp.context_sync_policy import PacketError,canonical,build_proposal,proposal_digest,confirmed_packet
from mvp.exploration_policy import strict_json,validate_uuid,validate_revision
from mvp.devtools.workbench import origin_port,project
from mvp.devtools.workbench_write import _check_path,_directory_pins,_open_control


def _windows_drive_type(root):
    import ctypes
    function=ctypes.WinDLL('kernel32',use_last_error=True).GetDriveTypeW
    function.argtypes=[ctypes.c_wchar_p];function.restype=ctypes.c_uint
    return function(root)


def local_path(path):
    path=Path(path)
    if not path.is_absolute(): raise PacketError('ABSOLUTE_PATH_REQUIRED')
    raw=os.fspath(path)
    if '..' in path.parts: raise PacketError('LOCAL_FILESYSTEM_REQUIRED')
    if raw.startswith(('\\\\','//')): raise PacketError('LOCAL_FILESYSTEM_REQUIRED')
    if os.name=='nt':
        if not re.match(r'^[A-Za-z]:[\\/]',raw) or _windows_drive_type(path.drive+'\\') not in (2,3,5,6):
            raise PacketError('LOCAL_FILESYSTEM_REQUIRED')
    else:
        # Fail closed on remote/unknown Linux mount types. Other platforms need
        # a reviewed filesystem detector before offline export is enabled.
        mounts=Path('/proc/self/mountinfo')
        if not mounts.is_file(): raise PacketError('LOCAL_FILESYSTEM_REQUIRED')
        candidates=[]
        for line in mounts.read_text().splitlines():
            left,right=line.split(' - ',1)
            mount=re.sub(r'\\([0-7]{3})',lambda m:chr(int(m[1],8)),left.split()[4])
            try:path.relative_to(mount)
            except ValueError:continue
            candidates.append((len(mount),right.split()[0]))
        if not candidates or max(candidates)[1] not in ('ext2','ext3','ext4','xfs','btrfs','tmpfs','ramfs','overlay','zfs','squashfs','f2fs','bcachefs'):
            raise PacketError('LOCAL_FILESYSTEM_REQUIRED')
    return path


def read_private_input(path,limit=65536):
    path=local_path(path)
    _check_path(path)
    with _directory_pins(path.parent),_open_control(path) as stream:
        raw=stream.read(limit+1)
    if len(raw)>limit: raise PacketError('INPUT_TOO_LARGE')
    return raw


def _current_sid():
    system=Path(os.environ.get('SystemRoot','C:/Windows'))/'System32'
    result=subprocess.run([str(system/'whoami.exe'),'/user','/fo','csv','/nh'],capture_output=True,timeout=5)
    if result.returncode: raise PacketError('PRIVATE_OUTPUT_REQUIRED')
    rows=list(csv.reader(io.StringIO(result.stdout.decode('utf-8',errors='replace'))))
    sid=next((row[-1].strip() for row in rows if row and re.fullmatch(r'S-[0-9]+(?:-[0-9]+)+',row[-1].strip())),None)
    if sid is None: raise PacketError('PRIVATE_OUTPUT_REQUIRED')
    return sid


def _private_create(path):
    if os.name!='nt':
        return os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    import ctypes
    from ctypes import wintypes
    import msvcrt
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    advapi=ctypes.WinDLL('advapi32',use_last_error=True)
    convert=advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW
    convert.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,ctypes.POINTER(ctypes.c_void_p),ctypes.c_void_p]
    convert.restype=wintypes.BOOL
    descriptor=ctypes.c_void_p()
    if not convert('D:P(A;;FA;;;'+_current_sid()+')',1,ctypes.byref(descriptor),None):
        raise PacketError('PRIVATE_OUTPUT_REQUIRED')
    class SecurityAttributes(ctypes.Structure):
        _fields_=[('length',wintypes.DWORD),('descriptor',ctypes.c_void_p),('inherit',wintypes.BOOL)]
    attributes=SecurityAttributes(ctypes.sizeof(SecurityAttributes),descriptor,False)
    create=kernel.CreateFileW
    create.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.POINTER(SecurityAttributes),wintypes.DWORD,wintypes.DWORD,wintypes.HANDLE]
    create.restype=wintypes.HANDLE
    kernel.LocalFree.argtypes=[ctypes.c_void_p];kernel.LocalFree.restype=ctypes.c_void_p
    try:
        handle=create(str(path),0x40000000|0x80,3,ctypes.byref(attributes),1,0x80,None)
        if handle==ctypes.c_void_p(-1).value:
            raise OSError(ctypes.get_last_error(),'private file creation failed')
        try:
            return msvcrt.open_osfhandle(handle,os.O_WRONLY|os.O_BINARY)
        except BaseException:
            kernel.CloseHandle.argtypes=[wintypes.HANDLE];kernel.CloseHandle(handle)
            raise
    finally:
        kernel.LocalFree(descriptor)


def _persistent_acls(fd):
    """Inspect the actual empty file's volume, including mounted volumes."""
    import ctypes
    from ctypes import wintypes
    import msvcrt
    function=ctypes.WinDLL('kernel32',use_last_error=True).GetVolumeInformationByHandleW
    function.argtypes=[wintypes.HANDLE,wintypes.LPWSTR,wintypes.DWORD,
                       ctypes.POINTER(wintypes.DWORD),ctypes.POINTER(wintypes.DWORD),
                       ctypes.POINTER(wintypes.DWORD),wintypes.LPWSTR,wintypes.DWORD]
    function.restype=wintypes.BOOL
    flags=wintypes.DWORD()
    return bool(function(msvcrt.get_osfhandle(fd),None,0,None,None,ctypes.byref(flags),None,0) and flags.value&8)


def publish_new(path,value):
    path=local_path(path)
    raw=canonical(value)+b'\n'
    _check_path(path)
    temporary=path.parent/('.context-'+str(uuid4())+'.tmp')
    with _directory_pins(path.parent):
        try:
            fd=_private_create(temporary)
            with os.fdopen(fd,'wb') as stream:
                if os.name=='nt' and not _persistent_acls(stream.fileno()):
                    raise PacketError('PRIVATE_OUTPUT_REQUIRED')
                # Windows protected DACL / POSIX 0600 applies at creation,
                # before any other principal could acquire a readable handle.
                stream.write(raw);stream.flush();os.fsync(stream.fileno())
                os.link(temporary,path)  # New target only; never replace.
        finally:
            if temporary.exists(): temporary.unlink()


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest='command',required=True)
    prepare=commands.add_parser('prepare')
    for name in ('origin','exploration-id','revision','event-id','namespace-id','project-id','task-id','instance-id','reported-status','summary-file','output'):
        prepare.add_argument('--'+name,required=True)
    prepare.add_argument('--allow-asset',action='append',default=[],help='explicitly permit this selected anchor in this local packet')
    export=commands.add_parser('export')
    export.add_argument('--proposal',required=True)
    export.add_argument('--ack-sha256',required=True)
    export.add_argument('--output',required=True)
    args=parser.parse_args(argv)
    try:
        token=os.environ.get('KNOT_WORKBENCH_TOKEN')
        if args.command=='prepare':
            if not token or len(token)<16: raise PacketError('TOKEN_REQUIRED')
            port=origin_port(args.origin)
            for name in ('exploration_id','event_id','namespace_id','project_id','task_id','instance_id'):
                validate_uuid(getattr(args,name))
            if not re.fullmatch('[1-9][0-9]{0,18}',args.revision): raise PacketError('INVALID_REVISION')
            revision=int(args.revision);validate_revision(revision,1)
            summary=read_private_input(args.summary_file,1024).decode('utf-8')
            checkpoint=project(port,'checkpoint',dict(exploration_id=args.exploration_id,revision=args.revision),token)
            proposal=build_proposal(checkpoint,exploration_id=args.exploration_id,revision=revision,event_id=args.event_id,
                namespace_id=args.namespace_id,project_id=args.project_id,task_id=args.task_id,instance_id=args.instance_id,
                reported_status=args.reported_status,summary=summary,allow_assets=args.allow_asset,token=token)
            publish_new(args.output,proposal)
            result=dict(status='prepared',proposal_sha256=proposal_digest(proposal,token))
        else:
            proposal=strict_json(read_private_input(args.proposal))
            packet=confirmed_packet(proposal,args.ack_sha256,token)
            publish_new(args.output,packet)
            result=dict(status='exported_locally',proposal_sha256=packet['local_confirmation']['proposal_sha256'],uploaded=False)
        print(json.dumps(result));return 0
    except PacketError as exc:
        print(json.dumps({'status':'error','code':str(exc)}));return 1
    except Exception:
        print(json.dumps({'status':'error','code':'PACKET_OPERATION_FAILED'}));return 1


if __name__=='__main__':
    raise SystemExit(main())
