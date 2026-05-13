import requests
from requests.auth import HTTPDigestAuth
import argparse
import json
import sys

def toggle_user_access(ip, user, pwd, user_id, user_name, action):
    auth = HTTPDigestAuth(user, pwd)
    
    # Se a ação for 'block', colocamos a data de validade no passado. 
    # Se for 'unblock', jogamos para 2037.
    valid_to = "2020-01-01 00:00:00" if action == "block" else "2037-12-31 23:59:59"
    
    try:
        # Usamos a ação updateMulti para sobrescrever apenas as regras do utilizador
        user_payload = {
            "UserList": [{
                "UserID": str(user_id),
                "UserName": str(user_name),
                "UserType": 0,
                "Authority": 2,
                "Password": "",
                "Doors": [0] if action == "unblock" else [], # Tira o acesso à porta
                "TimeSections": [255],
                "ValidFrom": "2020-01-01 00:00:00",
                "ValidTo": valid_to
            }]
        }
        
        url = f"http://{ip}/cgi-bin/AccessUser.cgi?action=updateMulti"
        r = requests.post(url, json=user_payload, auth=auth, timeout=10)
        
        if r.status_code != 200:
            print(json.dumps({"success": False, "error": f"Falha ao atualizar hardware: {r.text}"}))
            sys.exit(1)

        print(json.dumps({"success": True, "message": f"Acesso do usuário {action} com sucesso na máquina!"}))

    except Exception as e:
        print(json.dumps({"success": False, "error": f"Erro no script Python: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--ip', required=True)
    parser.add_argument('--user', required=True)
    parser.add_argument('--password', required=True)
    parser.add_argument('--userid', required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--action', required=True, choices=['block', 'unblock'])
    
    args = parser.parse_args()
    toggle_user_access(args.ip, args.user, args.password, args.userid, args.name, args.action)