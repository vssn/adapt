#!/usr/bin/env bash

# NOTE: This script can be sourced or executed, but NOT via symlink
REPO_ROOT=$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )
. "${REPO_ROOT}/scripts/release/release_utils.sh"

# Globals
declare -A ARGS
LERNA_ARGS=()
STARTERS_CMD="${REPO_ROOT}/scripts/starters.js"

function publishType {
    if ! isReleaseBranch ; then
        echo prerelease
        return
    fi
    case "$1" in
        major|minor|patch|prerelease|from-package)
            echo $1
            ;;

        [0-9]*)
            echo from-package
            ;;

        *)
            error ERROR: Unsupported version type: $1
            return 1
            ;;
    esac
}

# Check version type/branch
function checkVersionArg {
    case "$1" in
        "")
            error "ERROR: Version type must be specified"
            usage
            return 1
            ;;

        dev)
            if isReleaseBranch ; then
                error "ERROR: Do not use 'dev' while on a release branch"
                return 1
            fi
            ;;

        major|minor|prerelease|[0-9]*)
            if [[ $(currentBranch) != "master" ]]; then
                error "ERROR: $1 releases must be made from master"
                return 1
            fi
            updateBranch || return 1
            ;;

        from-package|patch)
            if ! isReleaseBranch ; then
                error "ERROR: $1 releases must be made from a release branch"
                return 1
            fi
            updateBranch || return 1
            ;;

        *)
            error "ERROR: Invalid version type $1"
            return 1
            ;;
    esac
}

function setPublishArgs {
    local ALLOW_YES="$1"
    local PREID=$(prereleaseId)
    local BRANCH=$(currentBranch)
    local DIST_TAG PUBLISH_TYPE

    # Always publish all packages together
    LERNA_ARGS=(publish --force-publish)

    if [[ -n ${ARGS[debug]} ]]; then
        LERNA_ARGS+=("--loglevel=debug")
    fi

    if [[ ${ALLOW_YES} = "yes" && -n ${ARGS[yes]} ]]; then
        LERNA_ARGS+=("--yes")
    fi

    if [[ ${ARGS[version]} = "dev" ]]; then
        LERNA_ARGS+=("--allow-branch=${BRANCH}")
    fi

    if [[ -n ${ARGS[local]} ]]; then
        LERNA_ARGS+=(--no-push)
    fi

    DIST_TAG=$(distTag) || return 1
    LERNA_ARGS+=("--dist-tag=${DIST_TAG}")

    if [[ -n $PREID ]]; then
        LERNA_ARGS+=("--preid=${PREID}" "--pre-dist-tag=${DIST_TAG}")
    fi

    PUBLISH_TYPE=$(publishType "${ARGS[version]}") || return 1
    LERNA_ARGS+=("${PUBLISH_TYPE}")
}

function finalVersion {
    if [[ ${ARGS[version]} =~ ^[0-9] ]]; then
        echo "${ARGS[version]}"
        return
    fi

    local OUTPUT
    setPublishArgs no || return 1

    # Run lerna to see what version it will create, but don't use --yes 
    # The version lines look like this:
    #  - @adpt/core: 0.1.0-next.0 => 0.1.0-next.1
    OUTPUT=$("${REPO_ROOT}/node_modules/.bin/lerna" "${LERNA_ARGS[@]}" <<<"" | \
        egrep '^ - .*: .* => ' | head -1 | sed 's/^.* => //')
    if [[ ${OUTPUT} = "" ]]; then
        error "ERROR: Unable to parse version information from lerna"
        return 1
    fi
    echo "${OUTPUT}"
}

function checkRegistry {
    if [[ ${ARGS[local]} = "1" && -z $NPM_CONFIG_REGISTRY ]]; then 
        error ERROR: NPM_CONFIG_REGISTRY must be set when --local flag is used
        return 1
    fi
    if [[ -z ${ARGS[local]} && -n $NPM_CONFIG_REGISTRY ]]; then 
        error ERROR: NPM_CONFIG_REGISTRY must NOT be set unless --local flag is used
        return 1
    fi
}

function updateBranch {
    if ! isTreeClean ; then
        error "ERROR: source tree must not have any modifications"
        return 1
    fi

    if ! isReleaseBranch ; then
        return
    fi

    run git fetch origin || return 1
    run git pull --ff-only || return 1
}

function doBuild {
    if [[ -z ${ARGS[no-build]} ]]; then
        echo "Ensuring build is up to date. Building..."
        make build
    else
        echo "[SKIPPING] make build"
    fi
}

function distTag {
    if [[ ${ARGS[dist-tag]} =~ ^[-0-9v] ]]; then
        error "ERROR: Invalid tag '${ARGS[dist-tag]}' specified for dist-tag"
        return 1
    fi

    if [[ -n ${ARGS[dist-tag]} ]]; then
        echo "${ARGS[dist-tag]}"
        return
    fi

    case "${ARGS[version]}" in
        major|minor|patch)
            echo latest
            return
            ;;

        prerelease|dev)
            local TAG=$(prereleaseId)
            # Pre-release tag on a release branch is "alpha"
            TAG=${TAG:-alpha}
            echo ${TAG}
            return
            ;;

        [-0-9v]*|from-package)
            error "ERROR: --dist-tag must be specified with version ${ARGS[version]}"
            return 1
            ;;

        *)
            error "ERROR: invalid version ${ARGS[version]}"
            return 1
            ;;
    esac
}

function doSpecificVersion {
    local VERSION
    VERSION=$(sanitizeSemver "${ARGS[version]}") || return 1

    LERNA_ARGS=(version --force-publish --amend --no-git-tag-version "${VERSION}")
    checkDryRun "${REPO_ROOT}/node_modules/.bin/lerna" "${LERNA_ARGS[@]}" || return 1

    if [[ -n ${ARGS[dry-run]} ]]; then
        return
    fi

    git add -A || return 1
    echo "Committing the following files:"
    git status -s
    git commit -m "${VERSION}" || return 1
}

function tagStarters {
    local VERSION="$1"
    run "${STARTERS_CMD}" update || return 1
    run "${STARTERS_CMD}" tag -f "adapt-v${VERSION}" || return 1
}

function createReleaseBranch {
    local VERSION="$1"
    if [[ ${ARGS[version]} != "major" && ${ARGS[version]} != "minor" ]]; then
        return
    fi
    if [[ ${VERSION} =~ (^[0-9]+\.[0-9+]) ]]; then
        local MAJ_MIN="${BASH_REMATCH[1]}"
        local BRANCH="release-${MAJ_MIN}"
        run git branch "${BRANCH}" || return 1
        if [[ -z ${ADAPT_RELEASE_TESTS} ]]; then
            run git push --no-verify origin "${BRANCH}"
        fi
    else
        error "ERROR: Could not parse major and minor version from release version"
        return 1
    fi
}

function usage {
    cat <<USAGE

Publishes all packages to NPM registry.

Usage:
  $0 [ FLAGS ] <VERSION_TYPE>

  VERSION_TYPE:
      One of: major, minor, patch, prerelease, dev, or from-package
      Use from-package to publish without making any change to the current
      package.json versions.

  FLAGS:
      --debug           Show additional debugging output
      --dist-tag <tag>  NPM dist-tag to use. Defaults to 'latest' for
                        non-prerelease versions, 'next' for master prerelease,
                        and 'dev-<branchname>' for dev releases.
      --dry-run | -n    Do not commit, tag, or publish
      --local           Only publish packages to a local NPM registry, NOT the
                        global registry. NPM_CONFIG_REGISTRY must be set.
      --no-build        Do not run 'make build'
      --yes | -y        Do not prompt for confirmation
      -h | --help       Display help

Example:
  $0 minor

USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --debug)
            ARGS[debug]=1
            ;;

        --dist-tag)
            shift
            if [[ -z $1 ]]; then
                error "ERROR: no tag specified for dist-tag"
                exit 1
            fi
            ARGS[dist-tag]="$1"
            ;;

        --dry-run|-n)
            ARGS[dry-run]=1
            ;;

        --local)
            ARGS[local]=1
            ;;

        --no-build)
            ARGS[no-build]=1
            ;;

        --yes|-y)
            ARGS[yes]=1
            ;;

        -h|--help)
            usage
            exit 0
            ;;

        -*)
            error "ERROR: Unrecognized flag: $1"
            usage
            exit 1
            ;;

        *)
            if [[ -n "${ARGS[version]}" ]]; then
                error ERROR: Too many arguments
                usage
                exit 1
            fi

            ARGS[version]="$1"
            ;;
    esac
    shift
done

# Check version type/branch
checkVersionArg "${ARGS[version]}" || exit 1

# Check if we're publishing locally
checkRegistry || exit 1

# Build everything
doBuild || exit 1

# Compute what version we're going to create
FINAL_VERSION=$(finalVersion) || exit 1
echo "Version to publish will be '${FINAL_VERSION}'"

# Tag the starters
tagStarters "${FINAL_VERSION}" || exit 1

if [[ ${ARGS[version]} =~ ^[0-9] ]]; then
    doSpecificVersion || exit 1
fi

# Populate LERNA_ARGS
setPublishArgs yes || exit 1

# Do the publish
checkDryRun "${REPO_ROOT}/node_modules/.bin/lerna" "${LERNA_ARGS[@]}" || exit 1

# Create new release branch for appropriate release types
createReleaseBranch "${FINAL_VERSION}" || exit 1
