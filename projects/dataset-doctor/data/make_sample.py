"""Regenerate the synthetic sample dataset with planted, documented issues. Deterministic."""
import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
rng = random.Random(42)


def cpf() -> str:
    d = [rng.randint(0, 9) for _ in range(9)]
    for n in (9, 10):
        s = sum(d[i] * (n + 1 - i) for i in range(n))
        d.append(s * 10 % 11 % 10)
    s = "".join(map(str, d))
    return f"{s[:3]}.{s[3:6]}.{s[6:9]}-{s[9:]}"


def cnpj() -> str:
    d = [rng.randint(0, 9) for _ in range(8)] + [0, 0, 0, 1]
    for w in ([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]):
        r = sum(x * y for x, y in zip(d, w)) % 11
        d.append(0 if r < 2 else 11 - r)
    s = "".join(map(str, d))
    return f"{s[:2]}.{s[2:5]}.{s[5:8]}/{s[8:12]}-{s[12:]}"


topics = ["juros compostos", "fotossíntese", "a Revolução Francesa", "redes neurais", "o ciclo da água",
          "inflação", "a teoria da relatividade", "o sistema imunológico", "blockchain", "a Semana de Arte Moderna",
          "energia solar", "o Teorema de Pitágoras", "a Guerra Fria", "algoritmos de ordenação", "o efeito estufa",
          "a tabela periódica", "microeconomia", "a Lei de Ohm", "a Amazônia", "aprendizado por reforço",
          "o mercado de ações", "a evolução das espécies", "computação quântica", "o Barroco mineiro", "vacinas de mRNA",
          "a Constituição de 1988", "placas tectônicas", "criptografia assimétrica", "o samba", "buracos negros"]
styles = ["Explique {t} para uma criança de 10 anos.", "Resuma {t} em três frases.", "Quais são os principais pontos sobre {t}?"]


def answer(t: str, i: int) -> str:
    return (f"Sobre {t}: este é um resumo didático número {i}. Primeiro, apresentamos a ideia central de forma simples. "
            f"Depois, damos um exemplo do cotidiano que ajuda a fixar o conceito de {t}. Por fim, indicamos um erro "
            f"comum de entendimento e como evitá-lo, com uma dica prática para estudar o tema {i}.")


def rec(q: str, a: str) -> dict:
    return {"messages": [{"role": "user", "content": q}, {"role": "assistant", "content": a}]}


train, planted = [], {"exact_duplicates": [], "near_duplicates": [], "pii": {}, "too_short": [], "length_outliers": [],
                      "contaminated_test_items": [], "decoys": []}
for i, t in enumerate(topics):
    train.append(rec(styles[i % 3].format(t=t), answer(t, i)))

# exact duplicate (different casing/spacing: normalisation must catch it)
train.append(rec(train[3]["messages"][0]["content"].upper(), "  " + train[3]["messages"][1]["content"] + "  "))
planted["exact_duplicates"].append([3, len(train) - 1])
# near duplicate: one word changed
a5 = train[5]["messages"][1]["content"].replace("ajuda a fixar", "ajuda muito a fixar")
train.append(rec(train[5]["messages"][0]["content"], a5))
planted["near_duplicates"].append([5, len(train) - 1])
# PII
pii_cases = [
    ("email", "Meu e-mail é joana.silva@exemplo.com.br, pode me mandar o material?"),
    ("phone", "Me liga no (11) 98765-4321 depois das 18h para falar do curso."),
    ("cpf", f"Meu CPF é {cpf()}, preciso emitir a nota fiscal do curso."),
    ("cnpj", f"A empresa tem CNPJ {cnpj()} e quer contratar o treinamento."),
    ("credit_card", "Pode cobrar no cartão 4111 1111 1111 1111 com validade 12/30."),
    ("ipv4", "O servidor de testes está no IP 192.168.10.25 e não responde."),
]
for kind, q in pii_cases:
    train.append(rec(q, "Obrigado! Por segurança, nunca compartilhe dados pessoais em conversas abertas como esta."))
    planted["pii"][str(len(train) - 1)] = kind
# decoys that must NOT be flagged: invalid CPF checksum, order number, version string
for q in ["O protocolo do pedido é 123.456.789-00, ainda não chegou.",  # invalid CPF checksum
          "Uso a versão 3.11.4 do Python e o pacote 2.0.1.",
          "A turma 2026 tem 35 alunos e 4 professores."]:
    train.append(rec(q, "Entendi, vou verificar e retorno em breve com uma solução para o seu caso."))
    planted["decoys"].append(len(train) - 1)
# too short
train.append(rec("oi", "ok"))
planted["too_short"].append(len(train) - 1)
# length outlier (pasted log)
train.append(rec("Por que meu script falha?", "Traceback: " + " ".join(f"linha{i} erro de importacao no modulo" for i in range(200))))
planted["length_outliers"].append(len(train) - 1)

test = [rec("Explique o que é aprendizado supervisionado.", "Aprendizado supervisionado usa exemplos rotulados para treinar um modelo."),
        rec("Qual a capital do Peru?", "A capital do Peru é Lima, fundada em 1535."),
        # contaminated: copies a training answer
        rec("Fale sobre energia solar.", train[10]["messages"][1]["content"])]
planted["contaminated_test_items"].append([2, 10])

(HERE / "sample_train.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in train), encoding="utf-8")
(HERE / "sample_test.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in test), encoding="utf-8")
(HERE / "planted.json").write_text(json.dumps(planted, indent=2) + "\n", encoding="utf-8")
print(f"{len(train)} train, {len(test)} test")
