from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import doctor as dd  # noqa: E402

DATA = ROOT / "data"


class PiiTests(unittest.TestCase):
    def kinds(self, text):
        return [k for k, *_ in dd.find_pii(text)]

    def test_validators(self):
        self.assertTrue(dd._cpf_ok("52998224725"))
        self.assertFalse(dd._cpf_ok("52998224724"))
        self.assertFalse(dd._cpf_ok("11111111111"))
        self.assertTrue(dd._cnpj_ok("11222333000181"))
        self.assertFalse(dd._cnpj_ok("11222333000180"))
        self.assertTrue(dd._luhn_ok("4111111111111111"))
        self.assertFalse(dd._luhn_ok("4111111111111112"))

    def test_detection_and_precision(self):
        self.assertEqual(self.kinds("cpf 529.982.247-25"), ["cpf"])
        self.assertEqual(self.kinds("protocolo 529.982.247-24"), [])  # bad checksum is not a CPF
        self.assertEqual(self.kinds("a@b.com e 11.222.333/0001-81"), ["email", "cnpj"])
        self.assertEqual(self.kinds("versão 3.11.4"), [])
        self.assertEqual(self.kinds("ligue (21) 99876-5432"), ["phone"])

    def test_redact_nested(self):
        rec = {"messages": [{"role": "user", "content": "email x@y.com cartão 4111 1111 1111 1111"}]}
        out = dd.redact_record(rec)["messages"][0]["content"]
        self.assertEqual(out, "email [EMAIL] cartão [CREDIT_CARD]")


class DedupTests(unittest.TestCase):
    def test_near_duplicates_confirmed_by_jaccard(self):
        base = " ".join(f"palavra{i}" for i in range(60))
        texts = [base, base.replace("palavra30", "outra"), "texto completamente diferente sobre outro assunto qualquer"]
        pairs = dd.near_duplicates(texts, 0.8)
        self.assertEqual([(a, b) for a, b, _ in pairs], [(0, 1)])
        self.assertGreaterEqual(pairs[0][2], 0.8)

    def test_contamination_attributes_best_match(self):
        boiler = "este é um texto padrão repetido em todos os itens do conjunto de treino para teste"
        train = [boiler + " item zero", boiler + " item um com conteúdo próprio bem longo e específico aqui mesmo"]
        test = [train[1], "nada a ver com o resto e sem sobreposição de treze palavras seguidas"]
        hits = dd.contamination(train, test)
        self.assertEqual([(j, i) for j, i, _ in hits], [(0, 1)])
        self.assertEqual(hits[0][2], 1.0)


class PlantedTests(unittest.TestCase):
    """The audit must find exactly the planted issues: no misses, no false alarms on decoys."""

    @classmethod
    def setUpClass(cls):
        cls.planted = json.loads((DATA / "planted.json").read_text())
        train, _ = dd.load_jsonl(str(DATA / "sample_train.jsonl"))
        test, _ = dd.load_jsonl(str(DATA / "sample_test.jsonl"))
        cls.rep = dd.audit(train, test=test)

    def test_duplicates(self):
        self.assertEqual([[d["first"], d["dup"]] for d in self.rep["exact_duplicates"]], self.planted["exact_duplicates"])
        self.assertEqual([[d["a"], d["b"]] for d in self.rep["near_duplicates"]], self.planted["near_duplicates"])

    def test_pii_exact(self):
        found = {str(p["record"]): p["kind"] for p in self.rep["pii"]}
        self.assertEqual(found, self.planted["pii"])
        self.assertFalse(set(map(str, self.planted["decoys"])) & set(found))

    def test_lengths_and_contamination(self):
        self.assertEqual(self.rep["too_short"], self.planted["too_short"])
        self.assertEqual(self.rep["length_outliers"], self.planted["length_outliers"])
        self.assertEqual([[c["test"], c["train"]] for c in self.rep["contaminated_test_items"]],
                         self.planted["contaminated_test_items"])

    def test_clean_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "c.jsonl"
            self.assertEqual(dd.main(["clean", str(DATA / "sample_train.jsonl"), "-o", str(out),
                                      "--dedupe", "--redact", "--drop-short"]), 0)
            recs, errs = dd.load_jsonl(str(out))
            rep = dd.audit(recs)
            self.assertEqual((len(recs), errs, rep["pii"], rep["exact_duplicates"]), (40, [], [], []))

    def test_min_health_gate(self):
        self.assertEqual(dd.main(["audit", str(DATA / "sample_train.jsonl"), "--min-health", "90", "--json"]), 1)


if __name__ == "__main__":
    unittest.main()
