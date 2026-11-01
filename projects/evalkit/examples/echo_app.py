"""A toy 'app' to show the cmd: provider. Reads the prompt on stdin, answers on stdout."""
import sys

prompt = sys.stdin.read().lower()
if "reembolso" in prompt:
    print("Você tem 7 dias para pedir reembolso.")
elif "frete" in prompt:
    print("Total: R$ 37,50.")
else:
    print("Desculpe, não posso ajudar com isso.")
