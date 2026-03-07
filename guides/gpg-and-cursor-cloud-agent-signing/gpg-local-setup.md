# Setting up GPG locally

> This explains how to configure GPG in the local environment.
> See [Cursor Cloud Agent Autosign Guide](./cursor-cloud-agent-autosign-guide.md)
> for how to set this up in the cloud environment. You'll still need
> to generate a GPG key for that, but you won't have to do all this
> manual setup.

First let me clarify something real quick: Your name and email are attached to a commit automatically as long as you have configured them globally in git (more on that later in this answer). The *[signing](https://stackoverflow.com/questions/454048/what-is-the-difference-between-encrypting-and-signing-in-asymmetric-encryption)* is actually done using an [asymmetric key pair](https://www.ibm.com/think/topics/asymmetric-encryption), usually through GPG. Your name and email are also associated with the GPG key (and are automatically attached alongside the signature), so a signed commit technically contains that information twice - once from git, and once from GPG. Keep that in mind when configuring the two; ideally use the same name and email for both to eliminate any potential confusion. I won't get into that too much, but what you want to accomplish is this: When you make a commit, you want git to invoke GPG to make a [cryptographic signature](https://www.cisa.gov/news-events/news/understanding-digital-signatures) on the commit, so that someone else can check the signature later using a "public key" you give them.

I'm going to assume you're talking about signing commits with [GPG](https://www.gnupg.org/) here, since it's the most common method. I'll also assume you already have a GPG key pair for your name and email address, and that you have already added the public key to your GitHub account. If you don't, download GPG using one of the following methods:

- Linux: GPG is pre-installed already on most distros (probably all the common ones). If you don't have it for some reason (i.e. the `gpg` command is missing), install it using your system's package manager.
- MacOS: [Install it using homebrew](https://formulae.brew.sh/formula/gnupg).
- Windows: Download it from [gpg4win](https://www.gpg4win.org/). That is the official windows download - the [GPG homepage links to it](https://www.gnupg.org/index.html).

Once you have `gpg` installed, follow the great GitHub guides on [generating a new GPG key pair](https://docs.github.com/en/authentication/managing-commit-signature-verification/generating-a-new-gpg-key) and [adding the public key to your GitHub account](https://docs.github.com/en/authentication/managing-commit-signature-verification/adding-a-gpg-key-to-your-github-account). (They also have a [short doc on signing commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits) if you want a starting point for some additional reading). Adding the *public* key to your GitHub account is an important step. If you don't do that, GitHub won't be able to verify that your commits are properly signed. Quick note for those guides: ***Make sure you use the same email address as your GitHub account when generating the keys. If you don't, you'll probably encounter an issue where GitHub fails to verify your commits because it looks for a GPG key under a different email (the one your signing key specified).***

Apparently you can also sign commits using an SSH or S/MIME key as well. However, I've never seen anyone do that nor had to do it myself in practice, so I'd stick with GPG unless specifically instructed otherwise.

Also, make sure you [(globally) configure Git to use your name and email address for commits](https://git-scm.com/book/en/v2/Customizing-Git-Git-Configuration#_git_config):

```sh
git config --global user.name 'Yourfirstname Yourlastname'
git config --global user.email 'your_email@example.com'
```

At this point, verify that your configuration is correct. In the terminal, run:

```sh
git config --global user.name
# ^ should output your full name

git config --global user.email
# ^ should output your email address

gpg -k
# ^ should output something like:
#
# pub   ed25519 2025-07-15 [C] [expires: 2027-07-15]
#     ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890101
# uid           [ultimate] Yourfirstname Yourlastname <your_email@example.com>
# sub   cv25519 2025-07-15 [E] [expires: 2027-07-15]
# sub   ed25519 2025-07-15 [S] [expires: 2027-07-15]
```

Take note of the string of random characters like `ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890101`. That's your GPG key ID. You'll need it in the next step.

Now that we have a key pair and the basic git info in place, we'll configure git to sign commits by default. In the terminal, run:

```sh
# This is where you should use your GPG key ID from the previous step.
# Don't use this one - it's just a placeholder.
git config --global user.signingKey 'ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890101'

# Configure git to sign commits by default
git config --global commit.gpgsign true
```

As an added bonus, you can also have git sign tags by default:

```sh
git config --global tag.gpgSign true
```

You can verify that all this has taken effect by viewing your `~/.gitconfig` file (`$env:USERPROFILE\.gitconfig` if accessed from PowerShell on Windows). It should look something like this:

```toml
[user]
	name = Yourfirstname Yourlastname
	email = your_email@example.com
	signingKey = ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890101
[commit]
	gpgsign = true
[tag]
	gpgSign = true
```

Now try making a commit the same way you always do, either through the terminal or through Cursor's UI. GPG may ask you to input a password if you assigned one to your key. Once the commit succeeds, verify that the signature actually happened by running

```sh
git log --show-signature
```

in the repository. If it succeeded, your output should look something like this:

```txt
commit 9a3fca344fc4fa18dd23b6762deed51254f4ad80 (HEAD -> main)
gpg: Signature made Fri Nov  7 04:27:14 2025 CST
gpg:                using EDDSA key ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890101
gpg: Good signature from "Yourfirstname Yourlastname <your_email@example.com>" [ultimate]
Author: Yourfirstname Yourlastname <your_email@example.com>
Date:   Fri Nov 7 04:27:14 2025 -0600
```

where a successful signature and verification is denoted by the `Good signature from "Yourfirstname ...` message.

## If your commit/signature failed

While debugging the signing process, you can use `echo 'test' | gpg --clearsign` to see whether GPG actually runs properly. If your GPG is set up and working properly, you'll get an output like this:

```txt
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

test
-----BEGIN PGP SIGNATURE-----

iHUEARYKAB0WIQRI3DqE2xJF0MxyuA+WQUVgYGHLGQUCaQ3g/QAKCRCWQUVgYGHL
GfW2AQCyiLYY3vc7/zH+kE0whMLYvterztOhJl/+MsCIJ2pLVwEA0vjZkuVXgbyw
MURbaOiJ59dPXvj0z5GyHP5lr7NX0QE=
=UrJF
-----END PGP SIGNATURE-----
```

And if you think maybe git isn't invoking `gpg` automatically, you can manually tell it to sign a commit using the `-S` flag:

```sh
git commit -S -m 'Awesome commit message'
```

### Failed On MacOS

Signing commits will fail by default on Macbooks and MacOS because it doesn't have a *pinentry* program installed by default. When Git invokes GPG to sign a commit, GPG has no way to prompt the user for a password, and fails with this message:

`error: gpg failed to sign the data fatal: failed to write commit object`

Follow these steps to resolve:

1. `brew install pinentry-mac`
2. Add this line to *~/.gnupg/gpg-agent.conf* :

```txt
pinentry-program /opt/homebrew/bin/pinentry-mac
```

3. Kill GPG agent: `killall gpg-agent`, then try the commit/signature again. It should work.

### Failed On Windows

The gpg4win installation ([official GPG distribution for Windows](https://www.gpg4win.org/about.html)) is finicky because it can conflict a bit with the GPG that comes preinstalled with "Git Bash", the bash shell that ships with the Git Windows installation for some reason. For me, the issue is usually that the GPG agent doesn't launch properly on startup. I don't know exactly why that is, but you can fix it by running these commands:

```powershell
gpgconf --launch gpg-agent
gpg-connect-agent.exe /bye
gpgconf --reload gpg-agent
```

and if that still doesn't work, just launch the program called **Kleopatra**. [It's part of the gpg4win distribution](https://www.gpg4win.org/about.html). Once Kleopatra finishes loading, your commit should work.

Trying these two things should solve the issue 100% of the time.

### Failed On Linux through SSH

Add this to your *.bashrc*, *.zshrc*, or whatever config file you use for your shell:

```sh
export GPG_TTY=$(tty)
```

Then either restart the SSH session (log out then log back in), or reload the shell with a command like `exec bash`, `exec zsh`, etc. (whichever shell you use). Once you're back in the reloaded session, install `pinentry-curses` using your distro's package manager, and add this line to *~/.gnupg/gpg-agent.conf*:

```
pinentry-program /usr/bin/pinentry-curses
```

That gives you a nice full-terminal password entry experience. You can probably use `pinentry-tty` instead if you want - I just like `pinentry-curses` better.

### Failed on Linux Desktop environment

I have no idea how to solve this one, sorry. Never seen `gpg` fail on Linux outside an SSH session.
