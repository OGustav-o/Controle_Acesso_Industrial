import requests
from requests.auth import HTTPDigestAuth
import argparse
import json
import sys

def register_user_and_face(ip, user, pwd, user_id, user_name, image_path):
    auth = HTTPDigestAuth(user, pwd)
    
    try:
        # 1. Cria o Utilizador no Dispositivo
        user_payload = {
            "UserList": [{
                "UserID": str(user_id),
                "UserName": str(user_name),
                "UserType": 0,
                "Authority": 2,
                "Password": "",
                "Doors": [0],
                "TimeSections": [255],
                "ValidFrom": "2020-01-01 00:00:00",
                "ValidTo": "2037-12-31 23:59:59"
            }]
        }
        
        url_user = f"http://{ip}/cgi-bin/AccessUser.cgi?action=insertMulti"
        r_user = requests.post(url_user, json=user_payload, auth=auth, timeout=10)
        r_user.raise_for_status()

        # 2. Envia a Foto (Biometria Facial)
        url_face = f"http://{ip}/cgi-bin/FaceInfoManager.cgi?action=add"
        
        # O dispositivo exige um campo 'info' com JSON e o arquivo físico da imagem
        payload_info = json.dumps({"UserID": str(user_id)})
        
        with open(image_path, 'rb') as f:
            files = {
                'info': (None, payload_info, 'application/json'),
                'pic': ('face.jpg', f, 'image/jpeg')
            }
            r_face = requests.post(url_face, files=files, auth=auth, timeout=15)
            r_face.raise_for_status()

        print(json.dumps({"success": True, "message": "Usuário e Rosto cadastrados na Intelbras com sucesso!"}))

    except requests.exceptions.RequestException as e:
        print(json.dumps({"success": False, "error": f"Falha na comunicação com Intelbras: {str(e)}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Erro interno: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--ip', required=True)
    parser.add_argument('--user', required=True)
    parser.add_argument('--password', required=True)
    parser.add_argument('--userid', required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--image', required=True, help="Caminho do arquivo da foto salva no servidor")
    
    args = parser.parse_args()
    register_user_and_face(args.ip, args.user, args.password, args.userid, args.name, args.image)