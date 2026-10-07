import importlib.util,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('refresh',Path(__file__).parents[1]/'prospect-pipeline/refresh.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RefreshTests(unittest.TestCase):
 def setUp(self):self.e={'company':'Test Buyer','canonicalDomain':'example.com','sourceUrl':'https://example.com/acquisitions','evidencePhrase':'buys industrial properties','generalEmail':'info@example.com'}
 def test_http200_without_evidence_is_not_verified(self):
  with self.assertRaises(ValueError):m.verify(self.e,lambda _: '<h1>Welcome</h1>')
 def test_scripts_not_used_as_evidence(self):
  with self.assertRaises(ValueError):m.verify(self.e,lambda _: '<script>buys industrial properties</script>')
 def test_only_attributed_published_contact(self):
  p=m.verify(self.e,lambda _:'<p>buys industrial properties other@example.com</p>');self.assertNotIn('generalEmail',p);self.assertNotIn('phone',p);self.assertNotIn('directEmail',p)
 def test_failure_keeps_previous_and_marks_stale(self):
  p=m.verify(self.e,lambda _:'<p>buys industrial properties info@example.com</p>');r=m.refresh([self.e],{'prospects':[p]},lambda _: '<p>Access denied</p>');self.assertEqual(r['prospects'][0]['sourceVersion'],p['sourceVersion']);self.assertIn('stale',r['prospects'][0]['sourceVerification']['status']);self.assertTrue(r['outboundContactLocked'])
 def test_source_version_ignores_check_time(self):
  self.assertEqual(m.verify(self.e,lambda _:'buys industrial properties')['sourceVersion'],m.verify(self.e,lambda _:'buys industrial properties')['sourceVersion'])
 def test_private_and_non_https_urls_blocked(self):
  for u in ('http://example.com','https://user:pass@example.com','https://127.0.0.1'):
   with self.assertRaises(ValueError):m.check_url(u)
 def test_private_redirect_blocked(self):
  from urllib.request import Request
  with self.assertRaises(ValueError):m.Redirects().redirect_request(Request('https://example.com'),None,302,'',{},'https://127.0.0.1/')
if __name__=='__main__':unittest.main()
