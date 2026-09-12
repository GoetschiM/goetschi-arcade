import os
import tarfile
import paramiko
import sys

HOST = "10.0.60.139"
USER = "root"
PASSWORD = "Louis_one_13"
LOCAL_DIR = os.path.join(os.path.dirname(__file__), "public")
TAR_FILE = os.path.join(os.path.dirname(__file__), "arcade_update.tar.gz")

def create_tar():
    print("Packaging arcade public folder...")
    with tarfile.open(TAR_FILE, "w:gz") as tar:
        for root, dirs, files in os.walk(LOCAL_DIR):
            for file in files:
                full_path = os.path.join(root, file)
                arcname = os.path.relpath(full_path, LOCAL_DIR)
                tar.add(full_path, arcname=arcname)
    print("Packaging complete.")

def deploy():
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        print(f"Connecting to {HOST}...")
        ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)
        print("Connected.")

        sftp = ssh.open_sftp()
        print("Uploading tar archive...")
        sftp.put(TAR_FILE, "/tmp/arcade_update.tar.gz")
        sftp.close()

        print("Extracting and updating Nginx web root...")
        commands = [
            "mkdir -p /tmp/arcade_update && tar -xzf /tmp/arcade_update.tar.gz -C /tmp/arcade_update",
            "docker cp /tmp/arcade_update/. dc5fp7ny50bjtfv45lar3v0n-180513486332:/usr/share/nginx/html/",
            "rm -rf /tmp/arcade_update /tmp/arcade_update.tar.gz"
        ]

        for cmd in commands:
            stdin, stdout, stderr = ssh.exec_command(cmd)
            exit_status = stdout.channel.recv_exit_status()
            out = stdout.read().decode('utf-8').strip()
            err = stderr.read().decode('utf-8').strip()
            if out: print(f"OUT: {out}")
            if err: print(f"ERR: {err}")
            print(f"Command '{cmd}' exited with status {exit_status}")

        ssh.close()
        print("Arcade deployment successful!")
    except Exception as e:
        print(f"Deployment failed: {e}")

if __name__ == "__main__":
    create_tar()
    deploy()
    if os.path.exists(TAR_FILE):
        os.remove(TAR_FILE)
