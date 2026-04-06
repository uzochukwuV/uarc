// SPDX-License-Identifier: MIT
pragma solidity >=0.8.19 <0.9.0;

contract MyMockFheOps {
    function maxValue(uint8 utype) public pure returns (uint256) {
        uint256 result = 0;
        if (utype == 0) { result = uint256(type(uint8).max) + 1; }
        else if (utype == 1) { result = uint256(type(uint16).max) + 1; }
        else if (utype == 2) { result = uint256(type(uint32).max) + 1; }
        else if (utype == 3) { result = uint256(type(uint64).max) + 1; }
        else if (utype == 4) { result = uint256(type(uint128).max) + 1; }
        else if (utype == 5) { result = 1; }
        else if (utype == 12) { result = uint256(type(uint160).max) + 1; }
        else if (utype == 13) { result = 1; }
        else { revert("Unsupported type"); }
        return result;
    }

    function bytes32ToBytes(bytes32 input, uint8) internal pure returns (bytes memory) { return bytes.concat(input); }

    function uint256ToBytes(uint256 value) public pure returns (bytes memory) {
        bytes memory result = new bytes(32);
        assembly { mstore(add(result, 32), value) }
        return result;
    }

    function boolToBytes(bool value) public pure returns (bytes memory) {
        bytes memory result = new bytes(1);
        if (value) { result[0] = 0x01; } else { result[0] = 0x00; }
        return result;
    }

    function bytesToUint(bytes memory b) internal pure virtual returns (uint256) {
        require(b.length <= 32, "Bytes length exceeds 32.");
        return abi.decode(abi.encodePacked(new bytes(32 - b.length), b), (uint256));
    }

    function bytesToBool(bytes memory b) internal pure virtual returns (bool) {
        require(b.length <= 32, "Bytes length exceeds 32.");
        uint8 value = uint8(b[0]);
        return value != 0;
    }

    function trivialEncrypt(bytes memory input, uint8 toType, int32) external pure returns (bytes memory) {
        bytes32 result = bytes32(input);
        return bytes32ToBytes(result, toType);
    }

    function add(uint8 utype, bytes memory lhsHash, bytes memory rhsHash) external pure returns (bytes memory) {
        uint256 result = (bytesToUint(lhsHash) + bytesToUint(rhsHash)) % maxValue(utype);
        return uint256ToBytes(result);
    }

    function sealOutput(uint8, bytes memory ctHash, bytes memory) external pure returns (string memory) { return string(ctHash); }

    function verify(uint8, bytes memory input, int32) external pure returns (bytes memory) { return input; }

    function cast(uint8, bytes memory input, uint8 toType) external pure returns (bytes memory) {
        bytes32 result = bytes32(input);
        return bytes32ToBytes(result, toType);
    }

    function decrypt(uint8, bytes memory input, uint256) external pure returns (uint256) { return bytesToUint(input); }

    function lte(uint8 utype, bytes memory lhsHash, bytes memory rhsHash) external pure returns (bytes memory) {
        bool result = (bytesToUint(lhsHash) % maxValue(utype)) <= (bytesToUint(rhsHash) % maxValue(utype));
        return boolToBytes(result);
    }

    function sub(uint8 utype, bytes memory lhsHash, bytes memory rhsHash) external pure returns (bytes memory) {
        uint256 result = (bytesToUint(lhsHash) - bytesToUint(rhsHash)) % maxValue(utype);
        return uint256ToBytes(result);
    }

    function mul(uint8 utype, bytes memory lhsHash, bytes memory rhsHash) external pure returns (bytes memory) {
        uint256 result = (bytesToUint(lhsHash) * bytesToUint(rhsHash)) % maxValue(utype);
        return uint256ToBytes(result);
    }

    function lt(uint8 utype, bytes memory lhsHash, bytes memory rhsHash) external pure returns (bytes memory) {
        bool result = (bytesToUint(lhsHash) % maxValue(utype)) < (bytesToUint(rhsHash) % maxValue(utype));
        return boolToBytes(result);
    }

    function select(uint8, bytes memory controlHash, bytes memory ifTrueHash, bytes memory ifFalseHash) external pure returns (bytes memory) {
        bool control = bytesToBool(controlHash);
        if (control) return ifTrueHash;
        return ifFalseHash;
    }

    function req(uint8, bytes memory input) external pure returns (bytes memory) {
        bool condition = (bytesToUint(input) != 0);
        require(condition);
        return input;
    }

    function gte(uint8 utype, bytes memory lhsHash, bytes memory rhsHash) external pure returns (bytes memory) {
        bool result = (bytesToUint(lhsHash) % maxValue(utype)) >= (bytesToUint(rhsHash) % maxValue(utype));
        return boolToBytes(result);
    }
}
