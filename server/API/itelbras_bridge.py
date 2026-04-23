import requests
import argparse
import json
import sys
from requests.auth import HTTPDigestAuth

def main():
    parser = argparse.ArgumentParser(description="Ponte de comunicação com Dispositivos Intelbras")
    parser.add_argument('--ip', required=True, help="Endereço IP do dispositivo")
    parser.add_argument('--user', required=True, help="Usuário do dispositivo")
    parser.add_argument('--password', required=True, help="Senha do dispositivo")
    parser.add_argument('--action', choices=['test_connection', 'open_door'], required=True, help="Ação a ser executada")
    parser.add_argument('--channel', type=int, default=1, help="Canal/Porta a ser acionada")
    
    args = parser.parse_args()
    
    base_url = f"http://{args.ip}/cgi-bin"
    auth = HTTPDigestAuth(args.user, args.password)

    try:
        if args.action == 'test_connection':
            # Endpoint básico para validar credenciais e comunicação
            response = requests.get(f"{base_url}/magicBox.cgi?action=getSystemInfo", auth=auth, timeout=5)
            response.raise_for_status()
            print(json.dumps({"success": True, "message": "Conexão estabelecida com sucesso."}))

        elif args.action == 'open_door':
            # Comando CGI para abertura remota de porta
            response = requests.get(f"{base_url}/accessControl.cgi?action=openDoor&channel={args.channel}", auth=auth, timeout=5)
            response.raise_for_status()
            print(json.dumps({"success": True, "message": f"Comando de abertura enviado para o canal {args.channel}."}))

    except requests.exceptions.RequestException as e:
        print(json.dumps({"success": False, "error": f"Erro de comunicação: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()