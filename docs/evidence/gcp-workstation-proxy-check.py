import importlib.util,unittest,unittest.mock as m,subprocess,time,os,signal
p=os.path.expanduser('~/.ssh/gcp_workstation_ssh_proxy.py')
spec=importlib.util.spec_from_file_location('proxy',p); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
class Tests(unittest.TestCase):
 def test_partial_write(self):
  parts=[]
  def write(fd,data): parts.append(data[:2]); return min(2,len(data))
  with m.patch.object(mod.os,'write',side_effect=write): mod.write_all(1,b'abcdefg')
  self.assertEqual(b''.join(parts),b'abcdefg')
 def test_redaction(self):
  result=mod.safe_error(b'403 https://host/?token=SECRET Authorization: Bearer SECRET')
  self.assertIn('403',result); self.assertNotIn('SECRET',result)
 def test_eof_cleanup(self):
  proc=subprocess.Popen(['/usr/bin/python3',p],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  time.sleep(.5)
  child=int(subprocess.check_output(['pgrep','-P',str(proc.pid)],text=True).strip())
  proc.communicate(b'',timeout=8)
  self.assertEqual(proc.returncode,0)
  with self.assertRaises(ProcessLookupError): os.kill(child,0)
 def test_signal_cleanup(self):
  proc=subprocess.Popen(['/usr/bin/python3',p],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  time.sleep(.5)
  child=int(subprocess.check_output(['pgrep','-P',str(proc.pid)],text=True).strip())
  proc.send_signal(signal.SIGTERM);proc.wait(timeout=8);proc.communicate()
  self.assertEqual(proc.returncode,1)
  with self.assertRaises(ProcessLookupError): os.kill(child,0)
unittest.main()
