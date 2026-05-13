import requests
import argparse
import json
import sys
from requests.auth import HTTPDigestAuth

def main():
    # Configuração dos argumentos que o Node.js vai enviar
    parser = argparse.ArgumentParser(description="Ponte de comunicação com Intelbras")
    parser.add_argument('--ip', required=True, help="Endereço IP do dispositivo")
    parser.add_argument('--user', required=True, help="Usuário do dispositivo")
    parser.add_argument('--password', required=True, help="Senha do dispositivo")
    parser.add_argument('--action', choices=['test', 'open'], required=True, help="Ação a executar")
    parser.add_argument('--channel', type=int, default=1, help="Canal da porta")
    
    args = parser.parse_args()
    
    # A API da Intelbras funciona através de comandos CGI
    base_url = f"http://{args.ip}/cgi-bin"
    auth = HTTPDigestAuth(args.user, args.password)

    try:
        if args.action == 'test':
            # Tenta ler as informações do sistema para validar as credenciais
            url = f"{base_url}/magicBox.cgi?action=getSystemInfo"
            response = requests.get(url, auth=auth, timeout=5)
            response.raise_for_status()
            print(json.dumps({"success": True, "message": "Comunicação com Intelbras OK!"}))

        elif args.action == 'open':
            # Envia o comando para atracar o relé do próprio terminal Intelbras
            url = f"{base_url}/accessControl.cgi?action=openDoor&channel={args.channel}"
            response = requests.get(url, auth=auth, timeout=5)
            response.raise_for_status()
            print(json.dumps({"success": True, "message": "Porta da Intelbras aberta com sucesso!"}))

    except requests.exceptions.Timeout:
        print(json.dumps({"success": False, "error": "Timeout: O dispositivo não respondeu a tempo (IP errado ou desligado)."}))
        sys.exit(1)
    except requests.exceptions.RequestException as e:
        # Se as credenciais estiverem erradas, a API devolve um erro 401 Unauthorized
        print(json.dumps({"success": False, "error": f"Erro de comunicação: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()